import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, matchFilters, nip19 } from 'nostr-tools';
import { NSecSigner, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';
import { NLogin } from '@nostrify/react/login';
import { TestApp } from '@/test/TestApp';
import { useSharedEventDrafts } from '@/hooks/use-shared-event-drafts';
import { createEventDraft } from '@/lib/event-authoring';
import { draftCreationEvent, draftRevisionEvent, StaleEventDraftError } from '@/lib/shared-event-drafts';
import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';
import { parseScheduleEvent, scheduleEventCivilDays } from '@/lib/schedule-event';
import { useEventAuthoring } from '@/hooks/useEventAuthoring';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';

const network = vi.hoisted(() => ({
  events: [] as NostrEvent[],
  attempts: [] as NostrEvent[],
  logins: [] as ReturnType<typeof NLogin.fromNsec>[],
  publicRead: true,
  writes: 0,
  failWrite: false,
  failConsumption: false,
  rejectWrite: false,
}));
vi.mock('@nostrify/react', async (original) => ({
  ...await original<typeof import('@nostrify/react')>(),
  useNostr: () => ({ nostr: {
    query: async (filters: NostrFilter[]) => network.events.filter((event) => matchFilters(filters, event)),
    event: async (event: NostrEvent) => {
      network.attempts.push(event);
      if (network.rejectWrite) throw new Error('Relay disconnected');
      if (network.failConsumption && event.tags.some(([tag, value]) => tag === 'op' && value === 'consume')) throw new Error('Consumption unavailable');
      if (!network.events.some((stored) => stored.id === event.id)) network.events.push(event);
      network.writes++;
      if (network.failWrite) throw new Error('Acknowledgment timed out');
    },
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
const scheduled = { ...fields, startDate: '2027-07-12', startTime: '00:30', endDate: '2027-07-13', endTime: '00:00' };
function setAuthority(pubkeys: string[]) {
  network.events = network.events.filter((event) => event.kind !== 30078);
  network.events.push({ id: crypto.randomUUID(), pubkey: SITE_OWNER_PUBKEY, kind: 30078, content: JSON.stringify(pubkeys), tags: [['d', ADMIN_LIST_DTAG]], created_at: 1, sig: '' });
}

beforeEach(() => {
  localStorage.clear();
  network.events = [];
  network.attempts = [];
  network.writes = 0;
  network.publicRead = true;
  network.failWrite = false;
  network.failConsumption = false;
  network.rejectWrite = false;
  network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
  setAuthority([alicePubkey, bobPubkey]);
});

describe('shared Event Draft persistence', () => {
  it('does not retransmit an uncertain older publication after reconciling a newer draft revision', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.rejectWrite = true;
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toThrow(); });
    network.rejectWrite = false;
    network.events.push(finalizeEvent(draftRevisionEvent({ ...fields, title: 'New revision' }, base), alice));
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toBeInstanceOf(StaleEventDraftError); });
    await act(async () => { await hook.result.current.refreshDrafts(); });
    const latest = hook.result.current.data![0];
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, latest)).rejects.toThrow('older revision'); });
    expect(network.attempts).toHaveLength(1);
  });
  it.each([
    { ...scheduled, title: '' },
    { ...scheduled, startTime: '' },
    { ...scheduled, tzid: 'Invalid/Timezone' },
    { ...scheduled, endDate: '2027-07-11' },
    { ...scheduled, startDate: '2027-03-28', startTime: '01:30' },
  ])('rejects invalid Schedule Event data before signing: %j', async (invalid) => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    await act(async () => { await expect(hook.result.current.publishDraft(invalid, hook.result.current.data![0])).rejects.toThrow(); });
    expect(network.attempts).toEqual([]);
    expect(hook.result.current.data).toHaveLength(1);
  });
  it('retains the draft when signing fails and can publish after the signer recovers', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    const signing = vi.spyOn(NSecSigner.prototype, 'signEvent').mockRejectedValueOnce(new Error('Signer declined'));
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toThrow('Signer declined'); });
    expect(network.attempts).toEqual([]);
    expect(hook.result.current.data).toHaveLength(1);
    signing.mockRestore();
    await act(async () => { await hook.result.current.publishDraft(scheduled, base); });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('refreshes before publishing, refuses stale input and consumed drafts, and rechecks publisher trust', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.events.push(finalizeEvent(draftRevisionEvent({ ...fields, title: 'Remote edit' }, base), alice));
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toBeInstanceOf(StaleEventDraftError); });
    expect(network.attempts).toEqual([]);
    await act(async () => { await hook.result.current.refreshDrafts(); });
    const latest = hook.result.current.data![0];
    setAuthority([alicePubkey]);
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, latest)).rejects.toThrow('Trusted Admin'); });
    expect(network.attempts).toEqual([]);
    setAuthority([alicePubkey, bobPubkey]);
    await act(async () => { await hook.result.current.publishDraft(scheduled, latest); });
    const attempts = network.attempts.length;
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, latest)).rejects.toThrow('already consumed'); });
    await act(async () => { await expect(hook.result.current.saveDraft(fields, latest)).rejects.toThrow('no longer available'); });
    expect(network.attempts).toHaveLength(attempts);
  });
  it('keeps publication ownership, trust, and provenance when its creator is revoked and the publisher edits', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(() => ({ drafts: useSharedEventDrafts(), authoring: useEventAuthoring(), schedule: useScheduleEvents() }), { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.drafts.data).toHaveLength(1));
    const base = hook.result.current.drafts.data![0];
    await act(async () => { await hook.result.current.drafts.publishDraft(scheduled, base); });
    setAuthority([bobPubkey]);
    await act(async () => { await hook.result.current.drafts.refreshDrafts(); });
    await waitFor(() => expect(hook.result.current.schedule.data).toHaveLength(1));
    const published = hook.result.current.schedule.data![0];
    expect(published.event.pubkey).toBe(bobPubkey);
    await act(async () => { await hook.result.current.authoring.publishDraft({ ...scheduled, title: 'Publisher edit' }, published); });
    const edited = network.attempts.at(-1)!;
    expect(edited.pubkey).toBe(bobPubkey);
    expect(edited.tags).toContainEqual(['d', published.d]);
    expect(edited.tags).toContainEqual(['e', base.id, '', 'root']);
    setAuthority([alicePubkey]);
    await act(async () => { await hook.result.current.drafts.refreshDrafts(); });
    await waitFor(() => expect(hook.result.current.schedule.data).toEqual([]));
  });
  it('recovers the same signed publication after reopening, preserving newer input', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.rejectWrite = true;
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toThrow('disconnected'); });
    const signed = network.attempts[0];
    hook.unmount();
    network.rejectWrite = false;
    const reopened = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(reopened.result.current.data).toHaveLength(1));
    await act(async () => { await expect(reopened.result.current.publishDraft({ ...scheduled, title: 'New input' }, base)).rejects.toThrow('newer input is retained'); });
    expect(network.events.filter((event) => event.kind === 31923).map((event) => event.id)).toEqual([signed.id]);
    expect(network.events.find((event) => event.kind === 31923)?.tags).toContainEqual(['title', 'Shared proposal']);
  });
  it.each(['write', 'read', 'consume'])('recovers a %s failure without signing a second Schedule Event', async (failure) => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.failWrite = failure === 'write';
    network.publicRead = failure !== 'read';
    network.failConsumption = failure === 'consume';
    await act(async () => { await expect(hook.result.current.publishDraft(scheduled, base)).rejects.toThrow(); });
    const published = network.events.find((event) => event.kind === 31923)!;
    await act(async () => { await hook.result.current.refreshDrafts(); });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    network.failWrite = false;
    network.publicRead = true;
    network.failConsumption = false;
    await act(async () => { await hook.result.current.publishDraft(scheduled, base); });
    expect(network.events.filter((event) => event.kind === 31923).map((event) => event.id)).toEqual([published.id]);
    const consumption = network.events.find((event) => event.tags.some(([tag, value]) => tag === 'op' && value === 'consume'))!;
    expect(consumption.pubkey).toBe(bobPubkey);
    expect(consumption.tags).toContainEqual(['e', published.id, '', 'published']);
    // A relay can remove a deleted/replaced Schedule Event; its regular consumption survives.
    network.events = network.events.filter((event) => event.id !== published.id);
    await act(async () => { await hook.result.current.refreshDrafts(); });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('publishes another admin’s draft under the connected signer and consumes it for both admins', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    await act(async () => { await hook.result.current.publishDraft(scheduled, base); });
    const published = network.events.find((event) => event.kind === 31923)!;
    expect(published.pubkey).toBe(bobPubkey);
    expect(published.tags).toContainEqual(['e', base.id, '', 'root']);
    const occurrence = parseScheduleEvent(published)!;
    expect(occurrence.start).toBe(Date.parse('2027-07-11T23:30:00Z') / 1000);
    expect(occurrence.startTzid).toBe('Europe/London');
    expect(scheduleEventCivilDays(occurrence)).toEqual(['2027-07-12']);
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    hook.unmount();
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
    const other = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(other.result.current.data).toEqual([]));
  });
  it.each(['write', 'read'])('retries the same signed deletion after a %s failure and checks current authority', async (failure) => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.failWrite = failure === 'write';
    network.publicRead = failure !== 'read';
    await act(async () => { await expect(hook.result.current.deleteDraft(base)).rejects.toThrow(failure === 'write' ? 'timed out' : 'retry Delete draft'); });
    const deletion = network.events.find((event) => event.tags.some(([tag, value]) => tag === 'op' && value === 'delete'))!;
    setAuthority([alicePubkey]);
    await act(async () => { await expect(hook.result.current.deleteDraft(base)).rejects.toThrow('Trusted Admin'); });
    expect(network.writes).toBe(1);
    setAuthority([alicePubkey, bobPubkey]);
    network.failWrite = false;
    network.publicRead = true;
    await act(async () => { await hook.result.current.deleteDraft(base); });
    expect(network.writes).toBe(2);
    expect(network.events.filter((event) => event.tags.some(([tag, value]) => tag === 'op' && value === 'delete')).map((event) => event.id)).toEqual([deletion.id]);
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Stale edit' }, base)).rejects.toThrow('no longer available'); });
  });
  it('deletes another admin’s draft and synchronizes dismissal across accounts', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    expect(network.writes).toBe(0);
    await act(async () => { await hook.result.current.deleteDraft(base); });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    expect(network.events.find((event) => event.tags.some(([tag, value]) => tag === 'op' && value === 'delete'))).toMatchObject({ pubkey: bobPubkey, kind: 3523 });
    hook.unmount();
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
    const other = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(other.result.current.data).toEqual([]));
    setAuthority([alicePubkey]);
    await act(async () => { await other.result.current.refreshDrafts(); });
    await waitFor(() => expect(other.result.current.data).toHaveLength(1));
  });
  it('lets another admin save a revision and refuses a stale overwrite', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    await act(async () => { await hook.result.current.saveDraft({ ...fields, title: 'Bob revision' }, base); });
    await waitFor(() => expect(hook.result.current.data?.[0]).toMatchObject({ id: base.id, creator: alicePubkey, event: { pubkey: bobPubkey }, fields: { title: 'Bob revision', tzid: 'Europe/London' } }));
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Stale input' }, base)).rejects.toBeInstanceOf(StaleEventDraftError); });
    expect(hook.result.current.data?.[0].fields.title).toBe('Bob revision');
  });
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

  it('recovers an ambiguous revision write and detects a later remote revision before saving', async () => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.failWrite = true;
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Recovered' }, base)).rejects.toThrow('timed out'); });
    network.failWrite = false;
    await act(async () => { await hook.result.current.saveDraft({ ...fields, title: 'Recovered' }, base); });
    await waitFor(() => expect(hook.result.current.data?.[0].fields.title).toBe('Recovered'));
    const recovered = hook.result.current.data![0];
    network.events.push(finalizeEvent(draftRevisionEvent({ ...fields, title: 'Remote edit' }, recovered), alice));
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Local edit' }, recovered)).rejects.toMatchObject({ latest: { fields: { title: 'Remote edit' } } }); });
    hook.unmount();
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(alice))];
    const reopened = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(reopened.result.current.data?.[0].fields.title).toBe('Remote edit'));
    expect(reopened.result.current.data).toHaveLength(1);
  });

  it.each([false, true])('requires reconciliation with a pending save when a remote revision arrives (reopened: %s)', async (reopen) => {
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const base = hook.result.current.data![0];
    network.publicRead = false;
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Pending edit' }, base)).rejects.toThrow('public access'); });
    network.publicRead = true;
    const remote = finalizeEvent({ ...draftRevisionEvent({ ...fields, title: 'Remote edit' }, base), created_at: Math.floor(Date.now() / 1000) + 2 }, alice);
    network.events.push(remote);
    await act(async () => { await hook.result.current.refreshDrafts(); });
    await waitFor(() => expect(hook.result.current.data?.[0].fields.title).toBe('Remote edit'));
    const reopened = hook.result.current.data![0];
    await act(async () => { await expect(hook.result.current.saveDraft({ ...fields, title: 'Reconciled input' }, reopen ? reopened : base)).rejects.toBeInstanceOf(StaleEventDraftError); });
    expect(network.writes).toBe(1);
    await act(async () => { await hook.result.current.saveDraft({ ...fields, title: 'Reconciled input' }, reopened); });
    await waitFor(() => expect(hook.result.current.data?.[0].fields.title).toBe('Reconciled input'));
  });

  it('excludes untrusted creations and hides drafts when their creator is revoked', async () => {
    const outsider = generateSecretKey();
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, outsider));
    network.events.push(finalizeEvent({ ...draftCreationEvent(fields), created_at: 1 }, alice));
    network.logins = [NLogin.fromNsec(nip19.nsecEncode(bob))];
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    setAuthority([bobPubkey]);
    await act(async () => { await hook.result.current.refreshDrafts(); });
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
    expect(network.writes).toBe(2);
    expect(hook.result.current.data).toHaveLength(1);
  });

  it('reuses the signed creation after an ambiguous write failure', async () => {
    network.failWrite = true;
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => { await expect(hook.result.current.saveDraft(fields)).rejects.toThrow('timed out'); });
    network.failWrite = false;
    await act(async () => { await hook.result.current.saveDraft(fields); });
    expect(hook.result.current.data).toHaveLength(1);
  });

  it('reconciles a previous save before allowing a changed proposal without discarding new input', async () => {
    network.publicRead = false;
    const hook = renderHook(useSharedEventDrafts, { wrapper: TestApp });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => { await expect(hook.result.current.saveDraft(fields)).rejects.toThrow('public access'); });
    network.publicRead = true;
    const changed = { ...fields, title: 'Another proposal' };
    await act(async () => { await expect(hook.result.current.saveDraft(changed)).rejects.toThrow('Previous draft is now saved'); });
    await act(async () => { await hook.result.current.saveDraft(changed); });
    expect(hook.result.current.data?.map((draft) => draft.fields.title).sort()).toEqual(['Another proposal', 'Shared proposal']);
  });
});
