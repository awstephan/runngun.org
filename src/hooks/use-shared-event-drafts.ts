import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NRelay1, type NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import type { EventDraft } from '@/lib/event-authoring';
import { draftCreationEvent, EVENT_DRAFT_KIND, EVENT_DRAFT_TOPIC, readSharedEventDrafts } from '@/lib/shared-event-drafts';

/** A separate connection deliberately has no signer or NIP-42 authentication. */
async function verifyPublicDraft(event: NostrEvent, urls: string[]): Promise<void> {
  const results = await Promise.allSettled(urls.map(async (url) => {
    const relay = new NRelay1(url);
    try {
      const events = await relay.query([{
        kinds: [EVENT_DRAFT_KIND], authors: [event.pubkey], '#t': [EVENT_DRAFT_TOPIC], ids: [event.id],
      }], { signal: AbortSignal.timeout(8_000) });
      if (!readSharedEventDrafts(events, [event.pubkey]).some((draft) => draft.id === event.id)) {
        throw new Error('Draft not returned anonymously');
      }
    } finally {
      await relay.close();
    }
  }));
  if (!results.some((result) => result.status === 'fulfilled')) {
    throw new Error('Draft sent, but public access could not be verified. Check your read/write relays, then retry Save draft to verify the same record.');
  }
}

export function useSharedEventDrafts() {
  const trustedAdmin = useTrustedAdmin();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const publication = useNostrPublish();
  const queryClient = useQueryClient();
  const pending = useRef<{ event: NostrEvent; fields: string }>();
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
    mutationFn: async (fields: EventDraft) => {
      const current = (await trustedAdmin.refetch()).data?.trustedAdmins ?? [];
      if (!user || !current.includes(user.pubkey)) throw new Error('Only a current Trusted Admin can save an Event Draft.');
      const urls = config.relayMetadata.relays.filter((relay) => relay.read && relay.write).map((relay) => relay.url);
      if (!urls.length) throw new Error('Enable a public relay for both reading and writing in Relay settings.');
      const serialized = JSON.stringify(fields);
      if (pending.current?.event.pubkey !== user.pubkey) pending.current = undefined;
      if (pending.current && pending.current.fields !== serialized) {
        throw new Error('A previous save is awaiting public verification. Reopen its original fields or refresh the draft list before creating another draft.');
      }
      if (!pending.current) {
        const event = await publication.mutateAsync(draftCreationEvent(fields));
        pending.current = { event, fields: serialized };
      }
      await verifyPublicDraft(pending.current.event, urls);
      pending.current = undefined;
      await queryClient.invalidateQueries({ queryKey: ['shared-event-drafts'] });
    },
    onError: (error) => console.error('Failed to save shared Event Draft:', error),
  });
  const refreshDrafts = async (): Promise<void> => {
    await trustedAdmin.refetch();
    await queryClient.invalidateQueries({ queryKey: ['shared-event-drafts'] });
  };
  return { ...query, data: isTrusted ? query.data : undefined, saveDraft: save.mutateAsync, isSaving: save.isPending, refreshDrafts };
}
