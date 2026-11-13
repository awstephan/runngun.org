import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { createEventDraft } from '@/lib/event-authoring';
import { draftCreationEvent, readSharedEventDrafts } from '@/lib/shared-event-drafts';

describe('shared Event Draft API', () => {
  it('honors trusted cross-admin dismissal over later revisions and revives after deleter revocation', () => {
    const root = finalizeEvent({ ...draftCreationEvent({ ...createEventDraft('Europe/London'), title: 'Proposal' }), created_at: 100 }, generateSecretKey());
    const deletion = finalizeEvent({ kind: 3523, content: '', created_at: 101, tags: [
      ['t', 'runngun-event-draft'], ['version', '1'], ['op', 'delete'], ['e', root.id, '', 'root'],
    ] }, generateSecretKey());
    const revision = finalizeEvent({ ...root, created_at: 102, tags: [
      ['t', 'runngun-event-draft'], ['version', '1'], ['op', 'revise'], ['title', 'Late revision'],
      ['e', root.id, '', 'root'], ['e', root.id, '', 'previous'],
    ] }, generateSecretKey());
    const records = [root, deletion, revision];
    expect(readSharedEventDrafts(records, [root.pubkey, deletion.pubkey, revision.pubkey])).toEqual([]);
    expect(readSharedEventDrafts(records, [root.pubkey, revision.pubkey])[0].fields.title).toBe('Late revision');
    expect(readSharedEventDrafts(records, [revision.pubkey])).toEqual([]);
    expect(readSharedEventDrafts([root, { ...deletion, content: 'forged' }], [root.pubkey, deletion.pubkey])).toHaveLength(1);
  });
  it('selects a trusted cross-admin revision while retaining creation provenance and honoring revocation', () => {
    const fields = { ...createEventDraft('Europe/London'), title: 'Original' };
    const root = finalizeEvent({ ...draftCreationEvent(fields), created_at: 100 }, generateSecretKey());
    const revision = finalizeEvent({ ...draftCreationEvent({ ...fields, title: 'Edited', startDate: '' }), tags: [
      ['t', 'runngun-event-draft'], ['version', '1'], ['op', 'revise'], ['title', 'Edited'],
      ['start_tzid', 'Europe/London'], ['e', root.id, '', 'root'], ['e', root.id, '', 'previous'],
    ], created_at: 101 }, generateSecretKey());
    expect(readSharedEventDrafts([revision, root], [root.pubkey, revision.pubkey])[0]).toMatchObject({
      id: root.id, creator: root.pubkey, event: revision, fields: { title: 'Edited', startDate: '', tzid: 'Europe/London' },
    });
    expect(readSharedEventDrafts([revision, root], [root.pubkey])[0].fields.title).toBe('Original');
    expect(readSharedEventDrafts([revision, root], [revision.pubkey])).toEqual([]);
  });
  it('reopens a title-only proposal from its signed creation record', () => {
    const fields = { ...createEventDraft('America/Chicago'), title: 'Spring proposal', startDate: '', startTime: '', endDate: '', endTime: '' };
    const event = finalizeEvent({ ...draftCreationEvent(fields), created_at: 100 }, generateSecretKey());
    const reopened = readSharedEventDrafts([event], [event.pubkey]);
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ id: event.id, creator: event.pubkey, fields });
    expect(event.kind).not.toBe(31923);
  });

  it('excludes unauthorized and revoked creators and rejects forged provenance', () => {
    const event = finalizeEvent({ ...draftCreationEvent({ ...createEventDraft('Europe/London'), title: 'Proposal' }), created_at: 100 }, generateSecretKey());
    expect(readSharedEventDrafts([event], [])).toEqual([]);
    expect(readSharedEventDrafts([{ ...event, pubkey: 'a'.repeat(64) }], ['a'.repeat(64)])).toEqual([]);
    expect(readSharedEventDrafts([event, event], [event.pubkey])).toHaveLength(1);
    const revision = finalizeEvent({ ...event, tags: [...event.tags.filter(([tag]) => tag !== 'op'), ['op', 'revise'], ['e', event.id]] }, generateSecretKey());
    expect(readSharedEventDrafts([revision], [revision.pubkey])).toEqual([]);
  });
});
