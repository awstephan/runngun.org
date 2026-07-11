import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

export const SCHEDULE_EVENT_KIND = 31923;
export const SCHEDULE_EVENT_TOPIC = 'runngun';

const DAY_SECONDS = 86_400;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export interface ScheduleEvent {
  event: NostrEvent;
  d: string;
  title: string;
  summary: string;
  content: string;
  start: number;
  end: number | undefined;
  days: string[];
  startTzid: string | undefined;
  endTzid: string | undefined;
  location: string | undefined;
  image: string | undefined;
  price: string | undefined;
  links: string[];
  tags: string[];
}

export type ScheduleEventState = 'upcoming' | 'in-progress' | 'past';

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tag]) => tag === name)?.[1];
}

function getTags(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter(([tag]) => tag === name)
    .map(([, value]) => value)
    .filter(Boolean);
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value || !POSITIVE_INTEGER.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

export function scheduleEventDays(start: number, end?: number): string[] {
  const firstDay = Math.floor(start / DAY_SECONDS);
  const lastDay = Math.floor(((end ?? start + 1) - 1) / DAY_SECONDS);
  return Array.from(
    { length: lastDay - firstDay + 1 },
    (_, index) => String(firstDay + index),
  );
}

export function parseScheduleEvent(event: NostrEvent): ScheduleEvent | null {
  if (event.kind !== SCHEDULE_EVENT_KIND) return null;

  const d = getTag(event, 'd');
  const title = getTag(event, 'title');
  const start = parseTimestamp(getTag(event, 'start'));
  const rawEnd = getTag(event, 'end');
  const end = rawEnd === undefined ? undefined : parseTimestamp(rawEnd);
  const days = getTags(event, 'D');
  const expectedDays = start === null ? [] : scheduleEventDays(start, end ?? undefined);
  const sortedDays = [...days].sort((left, right) => Number(left) - Number(right));

  if (
    !d ||
    !title ||
    start === null ||
    (rawEnd !== undefined && end === null) ||
    (typeof end === 'number' && end <= start) ||
    !getTags(event, 't').includes(SCHEDULE_EVENT_TOPIC) ||
    days.length !== new Set(days).size ||
    days.length !== expectedDays.length ||
    !sortedDays.every((day, index) => day === expectedDays[index])
  ) {
    return null;
  }

  return {
    event,
    d,
    title,
    summary: getTag(event, 'summary') ?? '',
    content: event.content,
    start,
    end: end ?? undefined,
    days: expectedDays,
    startTzid: getTag(event, 'start_tzid'),
    endTzid: getTag(event, 'end_tzid') ?? getTag(event, 'start_tzid'),
    location: getTag(event, 'location'),
    image: getTag(event, 'image'),
    price: getTag(event, 'price'),
    links: getTags(event, 'r'),
    tags: getTags(event, 't'),
  };
}

export function isScheduleEvent(event: NostrEvent): boolean {
  return parseScheduleEvent(event) !== null;
}

export function getScheduleEventState(
  event: Pick<ScheduleEvent, 'start' | 'end'>,
  now = Math.floor(Date.now() / 1000),
): ScheduleEventState {
  if (now < event.start) return 'upcoming';
  if (event.end !== undefined && now < event.end) return 'in-progress';
  if (event.end === undefined && now === event.start) return 'in-progress';
  return 'past';
}

export function partitionScheduleEvents(
  events: ScheduleEvent[],
  now = Math.floor(Date.now() / 1000),
): Record<ScheduleEventState, ScheduleEvent[]> {
  const partition: Record<ScheduleEventState, ScheduleEvent[]> = {
    upcoming: [],
    'in-progress': [],
    past: [],
  };

  for (const event of events) {
    partition[getScheduleEventState(event, now)].push(event);
  }
  partition.past.reverse();
  return partition;
}

export function scheduleEventCoordinate(event: ScheduleEvent): string {
  return `${SCHEDULE_EVENT_KIND}:${event.event.pubkey}:${event.d}`;
}

export function scheduleEventNaddr(event: ScheduleEvent): string {
  return nip19.naddrEncode({
    kind: SCHEDULE_EVENT_KIND,
    pubkey: event.event.pubkey,
    identifier: event.d,
  });
}
