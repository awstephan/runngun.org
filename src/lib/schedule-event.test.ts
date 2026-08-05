import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  parseScheduleEvent,
  scheduleEventCivilDays,
  scheduleEventDays,
  scheduleEventIntersectsMonth,
  scheduleMonthQueryDays,
  selectCanonicalScheduleEvent,
} from '@/lib/schedule-event';

function nostrEvent({
  start,
  end,
  startTzid = 'America/Chicago',
  endTzid,
  createdAt = 1,
  id = 'a',
}: {
  start: number;
  end?: number;
  startTzid?: string;
  endTzid?: string;
  createdAt?: number;
  id?: string;
}): NostrEvent {
  const tags = [
    ['d', 'event'],
    ['title', 'Event'],
    ['start', String(start)],
    ['start_tzid', startTzid],
    ['t', 'runngun'],
    ...scheduleEventDays(start, end).map((day) => ['D', day]),
  ];
  if (end !== undefined) tags.push(['end', String(end)]);
  if (endTzid !== undefined) tags.push(['end_tzid', endTzid]);
  return {
    id,
    pubkey: '1'.repeat(64),
    created_at: createdAt,
    kind: 31923,
    tags,
    content: '',
    sig: 'signature',
  };
}

describe('schedule event-local projection', () => {
  it('projects civil days across a DST transition', () => {
    const event = parseScheduleEvent(nostrEvent({
      start: Date.parse('2024-03-10T05:30:00Z') / 1000,
      end: Date.parse('2024-03-10T08:30:00Z') / 1000,
    }));

    expect(event && scheduleEventCivilDays(event)).toEqual(['2024-03-09', '2024-03-10']);
  });

  it('uses the event-local date when it differs from UTC', () => {
    const event = parseScheduleEvent(nostrEvent({
      start: Date.parse('2024-12-31T15:30:00Z') / 1000,
      startTzid: 'Asia/Tokyo',
    }));

    expect(event && scheduleEventCivilDays(event)).toEqual(['2025-01-01']);
    expect(event?.days).toEqual(scheduleEventDays(Date.parse('2024-12-31T15:30:00Z') / 1000));
    expect(event && scheduleEventIntersectsMonth(event, 2025, 0)).toBe(true);
    expect(event && scheduleEventIntersectsMonth(event, 2024, 11)).toBe(false);
    expect(scheduleMonthQueryDays(2025, 0)).toContain(event?.days[0]);
  });

  it('does not include an exclusive midnight end date', () => {
    const event = parseScheduleEvent(nostrEvent({
      start: Date.parse('2024-03-10T02:00:00Z') / 1000,
      end: Date.parse('2024-03-11T05:00:00Z') / 1000,
    }));

    expect(event && scheduleEventCivilDays(event)).toEqual(['2024-03-09', '2024-03-10']);
  });

  it('projects the exclusive end through end_tzid', () => {
    const event = parseScheduleEvent(nostrEvent({
      start: Date.parse('2025-01-01T22:00:00Z') / 1000,
      end: Date.parse('2025-01-02T08:00:00Z') / 1000,
      startTzid: 'Europe/London',
      endTzid: 'America/Los_Angeles',
    }));

    expect(event && scheduleEventCivilDays(event)).toEqual(['2025-01-01']);
  });

  it('rejects invalid IANA timezone identifiers', () => {
    expect(parseScheduleEvent(nostrEvent({ start: 1_700_000_000, startTzid: 'Mars/Olympus' }))).toBeNull();
  });
});

describe('canonical schedule event selection', () => {
  it('selects the newest revision and breaks timestamp ties by id', () => {
    const events = [
      nostrEvent({ start: 1_700_000_000, createdAt: 10, id: 'a' }),
      nostrEvent({ start: 1_700_000_100, createdAt: 11, id: 'b' }),
      nostrEvent({ start: 1_700_000_200, createdAt: 11, id: 'c' }),
    ];

    expect(selectCanonicalScheduleEvent(events)?.event.id).toBe('b');
  });
});
