import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NRelay1, type NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { verifyEvent } from 'nostr-tools';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import type { EventDraft } from '@/lib/event-authoring';
import { draftCreationEvent, draftRevisionEvent, EVENT_DRAFT_KIND, EVENT_DRAFT_TOPIC, readSharedEventDrafts, StaleEventDraftError, type SharedEventDraft } from '@/lib/shared-event-drafts';

/** A separate connection deliberately has no signer or NIP-42 authentication. */
async function verifyPublicDraft(event: NostrEvent, urls: string[], retryAction = 'Save draft'): Promise<void> {
  const results = await Promise.allSettled(urls.map(async (url) => {
    const relay = new NRelay1(url);
    try {
      const events = await relay.query([{
        kinds: [EVENT_DRAFT_KIND], authors: [event.pubkey], '#t': [EVENT_DRAFT_TOPIC], ids: [event.id],
      }], { signal: AbortSignal.timeout(8_000) });
      if (!events.some((record) => record.id === event.id && verifyEvent({ ...record }))) {
        throw new Error('Draft not returned anonymously');
      }
    } finally {
      await relay.close();
    }
  }));
  if (!results.some((result) => result.status === 'fulfilled')) {
    throw new Error(`Draft action sent, but public access could not be verified. Check your read/write relays, then retry ${retryAction} to verify the same record.`);
  }
}

export function useSharedEventDrafts() {
  const { nostr } = useNostr();
  const trustedAdmin = useTrustedAdmin({ refetchInterval: 30_000 });
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const pending = useRef(new Map<string, { event: NostrEvent; fields: string }>());
  const submittedFields = useRef('');
  const submittedScope = useRef('new');
  const publication = useNostrPublish({
    onSigned: (event) => { pending.current.set(submittedScope.current, { event, fields: submittedFields.current }); },
  });
  const authority = trustedAdmin.authority;
  const isTrusted = trustedAdmin.accessFor(user?.pubkey).status === 'trusted-admin';
  const readUrls = config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url).sort();
  const query = useQuery({
    queryKey: ['shared-event-drafts', authority?.revision, readUrls],
    queryFn: async ({ signal }) => {
      const events = await trustedAdmin.queryTrusted([{
        kinds: [EVENT_DRAFT_KIND], '#t': [EVENT_DRAFT_TOPIC], limit: 1000,
      }], { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
      return readSharedEventDrafts(events, authority?.trustedAdmins ?? []);
    },
    enabled: Boolean(authority) && isTrusted,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const save = useMutation({
    mutationFn: async ({ fields, base }: { fields: EventDraft; base?: SharedEventDraft }) => {
      const current = (await trustedAdmin.refetch()).data?.trustedAdmins ?? [];
      if (!user || !current.includes(user.pubkey)) throw new Error('Only a current Trusted Admin can save an Event Draft.');
      const urls = config.relayMetadata.relays.filter((relay) => relay.read && relay.write).map((relay) => relay.url);
      if (!urls.length) throw new Error('Enable a public relay for both reading and writing in Relay settings.');
      const serialized = JSON.stringify(fields);
      const scope = `${user.pubkey}:${base?.id ?? 'new'}`;
      const prior = pending.current.get(scope);
      const changed = prior && prior.fields !== serialized;
      if (base) {
        const events = await nostr.query([
          { kinds: [EVENT_DRAFT_KIND], authors: current, ids: [base.id] },
          { kinds: [EVENT_DRAFT_KIND], authors: current, '#t': [EVENT_DRAFT_TOPIC], '#e': [base.id], limit: 1000 },
        ], { signal: AbortSignal.timeout(10_000) });
        const latest = readSharedEventDrafts(events, current).find((draft) => draft.id === base.id);
        if (!latest) throw new Error('This draft is no longer available from the current Trusted Admins. Your input is retained.');
        const pendingBase = prior?.event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'previous')?.[1];
        const reopenedDifferentBase = prior && pendingBase !== base.event.id && prior.event.id !== base.event.id;
        if (reopenedDifferentBase || (latest.event.id !== base.event.id && latest.event.id !== prior?.event.id)) {
          pending.current.delete(scope);
          throw new StaleEventDraftError(latest);
        }
      }
      if (prior) {
        await publication.republish(prior.event);
      } else {
        submittedFields.current = serialized;
        submittedScope.current = scope;
        await publication.mutateAsync(base ? draftRevisionEvent(fields, base) : draftCreationEvent(fields));
      }
      const saved = pending.current.get(scope);
      if (!saved) throw new Error('The signer did not return a draft record. Retry Save draft.');
      await verifyPublicDraft(saved.event, urls);
      pending.current.delete(scope);
      await queryClient.invalidateQueries({ queryKey: ['shared-event-drafts'] });
      if (changed) throw new Error(base
        ? 'Previous revision is now saved. Your current fields are retained; choose Save draft again to load the latest revision before reconciling.'
        : 'Previous draft is now saved. Your current fields are retained; choose Save draft again to create another proposal.');
    },
    onError: (error) => console.error('Failed to save shared Event Draft:', error),
  });
  const deletion = useMutation({
    mutationFn: async (draft: SharedEventDraft) => {
      const current = (await trustedAdmin.refetch()).data?.trustedAdmins ?? [];
      if (!user || !current.includes(user.pubkey)) throw new Error('Only a current Trusted Admin can delete an Event Draft.');
      const urls = config.relayMetadata.relays.filter((relay) => relay.read && relay.write).map((relay) => relay.url);
      if (!urls.length) throw new Error('Enable a public relay for both reading and writing in Relay settings.');
      const roots = await nostr.query([{ kinds: [EVENT_DRAFT_KIND], authors: current, ids: [draft.id] }], { signal: AbortSignal.timeout(10_000) });
      if (!readSharedEventDrafts(roots, current).some((root) => root.id === draft.id)) {
        throw new Error('The draft creation is no longer available from the current Trusted Admins. Refresh drafts and try again.');
      }
      const scope = `${user.pubkey}:${draft.id}:delete`;
      const prior = pending.current.get(scope);
      if (prior) {
        await publication.republish(prior.event);
      } else {
        submittedScope.current = scope;
        submittedFields.current = '';
        await publication.mutateAsync({ kind: EVENT_DRAFT_KIND, content: '', tags: [
          ['t', EVENT_DRAFT_TOPIC], ['version', '1'], ['op', 'delete'],
          ['e', draft.id, '', 'root'], ['alt', 'Dismiss a shared Run & Gun Event Draft'],
        ] });
      }
      const saved = pending.current.get(scope);
      if (!saved) throw new Error('The signer did not return a deletion record. Retry Delete draft.');
      await verifyPublicDraft(saved.event, urls, 'Delete draft');
      pending.current.delete(scope);
      pending.current.delete(`${user.pubkey}:${draft.id}`);
      await queryClient.invalidateQueries({ queryKey: ['shared-event-drafts'] });
    },
    onError: (error) => console.error('Failed to delete shared Event Draft:', error),
  });
  const refreshDrafts = async (): Promise<void> => {
    await trustedAdmin.refetch();
    await queryClient.invalidateQueries({ queryKey: ['shared-event-drafts'] });
  };
  const saveDraft = (fields: EventDraft, base?: SharedEventDraft): Promise<void> => save.mutateAsync({ fields, base });
  return { ...query, data: isTrusted ? query.data : undefined, saveDraft, isSaving: save.isPending, deleteDraft: deletion.mutateAsync, isDeleting: deletion.isPending, refreshDrafts };
}
