import type { NostrEvent } from '@nostrify/nostrify';
import { describe, expect, it } from 'vitest';

import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '../lib/config';
import { parseScheduleEvent, type ScheduleEvent } from '../lib/schedule-event';
import {
  canonicalizeTrustedScheduleEvents,
  resolveFreshTrustedAdmins,
  serializeRss,
} from './rss-feed';

const TRUSTED_ADMIN = 'a'.repeat(64);
const UNTRUSTED_AUTHOR = 'b'.repeat(64);

function nostrEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: '1'.repeat(64),
    pubkey: TRUSTED_ADMIN,
    created_at: 1_700_000_000,
    kind: 31923,
    tags: [
      ['d', 'event-1'],
      ['title', 'A & B <Championship> "Final"'],
      ['start', '1893456000'],
      ['D', '21915'],
      ['t', 'runngun'],
    ],
    content: "Rock & roll's best\u0000 course",
    sig: '2'.repeat(128),
    ...overrides,
  };
}

describe('RSS feed', () => {
  it('escapes XML content and emits the canonical self URL', () => {
    const event = parseScheduleEvent(nostrEvent());
    expect(event).not.toBeNull();

    const xml = serializeRss([event as ScheduleEvent], {
      generatedAt: new Date('2029-12-01T00:00:00Z'),
    });

    expect(xml).toContain('A &amp; B &lt;Championship&gt; &quot;Final&quot;');
    expect(xml).toContain('Rock &amp; roll&apos;s best course');
    expect(xml).toContain('Date: Tue, Jan 1, 2030');
    expect(xml).toContain('Time: 12:00 AM UTC');
    expect(xml).toContain('href="https://runngun.org/rss.xml" rel="self"');
    expect(xml).not.toContain('\u0000');
  });

  it('uses the lowest id to resolve equal-timestamp authority events', () => {
    const accepted = nostrEvent({
      id: '3'.repeat(64),
      pubkey: SITE_OWNER_PUBKEY,
      kind: 30078,
      tags: [['d', ADMIN_LIST_DTAG]],
      content: JSON.stringify([TRUSTED_ADMIN]),
    });
    const rejected = { ...accepted, id: '4'.repeat(64), content: JSON.stringify([UNTRUSTED_AUTHOR]) };

    expect(resolveFreshTrustedAdmins([rejected, accepted])).toEqual([SITE_OWNER_PUBKEY, TRUSTED_ADMIN]);
  });

  it('uses only fresh owner authority and canonicalizes only trusted events', () => {
    const authority = nostrEvent({
      id: '3'.repeat(64),
      pubkey: SITE_OWNER_PUBKEY,
      kind: 30078,
      tags: [['d', ADMIN_LIST_DTAG]],
      content: JSON.stringify([TRUSTED_ADMIN]),
    });
    const trustedAdmins = resolveFreshTrustedAdmins([authority]);
    expect(trustedAdmins).toEqual([SITE_OWNER_PUBKEY, TRUSTED_ADMIN]);

    const older = nostrEvent({ id: '4'.repeat(64), created_at: 100 });
    const newer = nostrEvent({ id: '5'.repeat(64), created_at: 200 });
    const untrusted = nostrEvent({
      id: '6'.repeat(64),
      pubkey: UNTRUSTED_AUTHOR,
      created_at: 300,
    });
    const events = canonicalizeTrustedScheduleEvents(
      [older, untrusted, newer],
      trustedAdmins ?? [],
    );

    expect(events).toHaveLength(1);
    expect(events[0].event.id).toBe(newer.id);
  });
});
