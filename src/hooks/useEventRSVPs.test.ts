import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { describe, expect, it } from 'vitest';

import { canonicalizeRSVPs, decodeScheduleCoordinate, parseRSVP } from '@/hooks/useEventRSVPs';
import { makeRSVPEvent } from '@/hooks/usePublishRSVP';

const EVENT_AUTHOR = 'a'.repeat(64);
const RSVP_AUTHOR = 'b'.repeat(64);
const COORDINATE = `31923:${EVENT_AUTHOR}:weekly-run`;
const NADDR = nip19.naddrEncode({ kind: 31923, pubkey: EVENT_AUTHOR, identifier: 'weekly-run' });

function rsvp(id: string, createdAt: number, status: 'accepted' | 'tentative', d: string): NostrEvent {
  return {
    id,
    pubkey: RSVP_AUTHOR,
    kind: 31925,
    created_at: createdAt,
    content: '',
    tags: [['a', COORDINATE], ['d', d], ['status', status], ['p', EVENT_AUTHOR]],
    sig: '0'.repeat(128),
  };
}

describe('schedule RSVP identity', () => {
  it('uses one stable d tag when status changes', () => {
    const going = makeRSVPEvent({ eventNaddr: NADDR, status: 'going' });
    const tentative = makeRSVPEvent({ eventNaddr: NADDR, status: 'tentative' });

    expect(going.tags.find(([name]) => name === 'd')).toEqual(['d', COORDINATE]);
    expect(tentative.tags.find(([name]) => name === 'd')).toEqual(['d', COORDINATE]);
    expect(going.tags.find(([name]) => name === 'status')?.[1]).toBe('accepted');
  });

  it('validates the schedule coordinate and RSVP identity tags', () => {
    const coordinate = decodeScheduleCoordinate(NADDR);
    expect(coordinate).not.toBeNull();
    if (!coordinate) return;

    const valid = rsvp('1'.repeat(64), 1, 'accepted', COORDINATE);
    expect(parseRSVP(valid, coordinate)?.status).toBe('going');
    expect(parseRSVP({ ...valid, tags: valid.tags.map((tag) => tag[0] === 'a' ? ['a', `31923:${EVENT_AUTHOR}:other`] : tag) }, coordinate)).toBeNull();
    expect(decodeScheduleCoordinate(nip19.naddrEncode({ kind: 31922, pubkey: EVENT_AUTHOR, identifier: 'weekly-run' }))).toBeNull();
  });

  it('selects the latest RSVP per author across old status-specific coordinates', () => {
    const coordinate = decodeScheduleCoordinate(NADDR);
    expect(coordinate).not.toBeNull();
    if (!coordinate) return;

    const oldGoing = rsvp('1'.repeat(64), 10, 'accepted', `${COORDINATE}:going`);
    const oldTentative = rsvp('2'.repeat(64), 20, 'tentative', `${COORDINATE}:tentative`);
    const stableGoing = rsvp('3'.repeat(64), 30, 'accepted', COORDINATE);

    expect(canonicalizeRSVPs([stableGoing, oldGoing, oldTentative], coordinate)).toEqual([
      expect.objectContaining({ event: stableGoing, status: 'going', pubkey: RSVP_AUTHOR }),
    ]);
  });
});
