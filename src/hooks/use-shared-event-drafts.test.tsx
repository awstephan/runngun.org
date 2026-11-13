import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, matchFilters, nip19 } from 'nostr-tools';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { NLogin } from '@nostrify/react/login';
import { TestApp } from '@/test/TestApp';
import { useSharedEventDrafts } from '@/hooks/use-shared-event-drafts';
import { createEventDraft } from '@/lib/event-authoring';
import { draftCreationEvent } from '@/lib/shared-event-drafts';
import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';

const network = vi.hoisted(() => ({
  events: [] as NostrEvent[],
  logins: [] as ReturnType<typeof NLogin.fromNsec>[],
  publicRead: true,
  writes: 0,
}));
vi.mock('@nostrify/react', async (original) => ({
  ...await original<typeof import('@nostrify/react')>(),
  useNostr: () => ({ nostr: {
    query: async (filters: NostrFilter[]) => network.events.filter((event) => matchFilters(filters, event)),
    event: async (event: NostrEvent) => { network.events.push(event); network.writes++; },
  } }),
}));
vi.mock('@nostrify/react/login', async (original) => ({
  ...await original<typeof import('@nostrify/react/login')>(),
  useNostrLogin: () => ({ logins: network.logins }),
}));
vi.mock('@nostrify/nostrify', async (original) => ({
  ...await original<typeof import('@nostrify/nostrify')>(),
  NRelay1: class {
    async query(filters: NostrFilter[]) {
      return network.publicRead ? network.events.filter((event) => matchFilters(filters, event)) : [];
    }
    async close() {}
  },
}));

const alice = generateSecretKey();
const bob = generateSecretKey();
const alicePubkey = getPublicKey(alice);
const bobPubkey = getPublicKey(bob);
const fields = { ...createEventDraft('Europe/London'), title: 'Shared proposal', startDate: '', startTime: '', endDate: '', endTime: '' };
function setAuthority(pubkeys: string[]) {
  network.events = network.events.filter((event) => event.kind !== 30078);
  network.events.push({ id: crypto.randomUUID(), pubkey: SITE_OWNER_PUBKEY, kind: 30078, content: JSON.stringify(pubkeys), tags: [['d', ADMIN_LIST_DTAG]], created_at: 1, sig: '' });
}

beforeEach(() => {
  localStorage.clear();
  network.events = [];
  network.writes = 0;
  network.publicRead = true;
  network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
  setAuthority([alicePubkey, bobPubkey]);
});

describe('shared Event Draft persistence', () => {
  it('saves a title-only draft and reopens it in another account and session', async () => {
    const first = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await act(async () => { await first.result.current.saveDraft(fields); });
    first.unmount();
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const second = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(second.result.current.data).toHaveLength(1));
    expect(second.result.current.data?.[0]).toMatchObject({ creator: alicePubkey, fields });
    expect(network.writes).toBe(1);
  });

  it('excludes untrusted creations and hides drafts when their creator is revoked', async () => {
    const outsider = generateSecretKey();
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, outsider));
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    setAuthority([bobPubkey]);
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    hook.unmount();
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
    const revoked = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await act(async () => { await expect(revoked.result.current.saveDraft(fields)).rejects.toThrow('Trusted Admin'); });
    expect(network.writes).toBe(0);
  });

  it('requires anonymous readback and retries verification without creating another draft', async () => {
    network.publicRead = false;
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => { await expect(hook.result.current.saveDraft(fields)).rejects.toThrow('public access'); });
    network.publicRead = true;
    await act(async () => { await hook.result.current.saveDraft(fields); });
    expect(network.writes).toBe(1);
    expect(hook.result.current.data).toHaveLength(1);
  });
});
