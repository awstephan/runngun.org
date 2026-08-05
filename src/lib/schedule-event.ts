import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

export const SCHEDULE_EVENT_KIND = 31923;
export const SCHEDULE_EVENT_TOPIC = 'runngun';

const DAY_SECONDS = 86_400;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const UTC_TIME_ZONE = 'UTC';

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

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function civilDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function enumerateCivilDates(first: string, last: string): string[] {
  const [firstYear, firstMonth, firstDay] = first.split('-').map(Number);
  const [lastYear, lastMonth, lastDay] = last.split('-').map(Number);
  const cursor = new Date(Date.UTC(firstYear, firstMonth - 1, firstDay));
  const end = Date.UTC(lastYear, lastMonth - 1, lastDay);
  const dates: string[] = [];

  while (cursor.getTime() <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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
  const startTzid = getTag(event, 'start_tzid');
  const rawEndTzid = getTag(event, 'end_tzid');

  if (
    !d ||
    !title ||
    start === null ||
    (rawEnd !== undefined && end === null) ||
    (typeof end === 'number' && end <= start) ||
    !getTags(event, 't').includes(SCHEDULE_EVENT_TOPIC) ||
    days.length !== new Set(days).size ||
    days.length !== expectedDays.length ||
    !sortedDays.every((day, index) => day === expectedDays[index]) ||
    (startTzid !== undefined && !isValidIanaTimeZone(startTzid)) ||
    (rawEndTzid !== undefined && !isValidIanaTimeZone(rawEndTzid))
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
    startTzid,
    endTzid: rawEndTzid ?? startTzid,
    location: getTag(event, 'location'),
    image: getTag(event, 'image'),
    price: getTag(event, 'price'),
    links: getTags(event, 'r'),
    tags: getTags(event, 't'),
  };
}

export function scheduleEventCivilDays(
  event: Pick<ScheduleEvent, 'start' | 'end' | 'startTzid' | 'endTzid'>,
): string[] {
  const startZone = event.startTzid ?? UTC_TIME_ZONE;
  const endZone = event.endTzid ?? startZone;
  const first = civilDate(event.start, startZone);
  const last = civilDate(event.end === undefined ? event.start : event.end - 1, endZone);
  return enumerateCivilDates(first < last ? first : last, first < last ? last : first);
}

export function scheduleEventIntersectsMonth(
  event: Pick<ScheduleEvent, 'start' | 'end' | 'startTzid' | 'endTzid'>,
  year: number,
  month: number,
): boolean {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  return scheduleEventCivilDays(event).some((date) => date.startsWith(prefix));
}

export function scheduleMonthQueryDays(year: number, month: number): string[] {
  const monthStart = Date.UTC(year, month, 1) / 1000;
  const nextMonthStart = Date.UTC(year, month + 1, 1) / 1000;
  // IANA civil offsets range from UTC-12 through UTC+14.
  return scheduleEventDays(monthStart - 14 * 3600, nextMonthStart + 12 * 3600);
}

export function formatScheduleEventDate(
  event: Pick<ScheduleEvent, 'start' | 'end' | 'startTzid' | 'endTzid'>,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const days = scheduleEventCivilDays(event);
  const format = (date: string, includeWeekday: boolean) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(includeWeekday ? { weekday: 'short' as const } : {}),
      ...options,
      timeZone: UTC_TIME_ZONE,
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  const first = format(days[0], true);
  const last = format(days[days.length - 1], false);
  return days.length === 1 ? first : `${first} – ${last}`;
}

export function formatScheduleEventTime(
  event: Pick<ScheduleEvent, 'start' | 'end' | 'startTzid' | 'endTzid'>,
): string {
  const startZone = event.startTzid ?? UTC_TIME_ZONE;
  const endZone = event.endTzid ?? startZone;
  const format = (timestamp: number, timeZone: string) => new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(timestamp * 1000));
  const start = format(event.start, startZone);
  return event.end === undefined ? start : `${start} – ${format(event.end, endZone)}`;
}

export function selectCanonicalScheduleEvents(events: NostrEvent[]): ScheduleEvent[] {
  const latestByCoordinate = new Map<string, ScheduleEvent>();
  for (const nostrEvent of events) {
    const event = parseScheduleEvent(nostrEvent);
    if (!event) continue;
    const coordinate = scheduleEventCoordinate(event);
    const current = latestByCoordinate.get(coordinate);
    if (
      !current ||
      event.event.created_at > current.event.created_at ||
      (event.event.created_at === current.event.created_at && event.event.id < current.event.id)
    ) {
      latestByCoordinate.set(coordinate, event);
    }
  }
  return [...latestByCoordinate.values()].sort((left, right) => left.start - right.start);
}

export function selectCanonicalScheduleEvent(events: NostrEvent[]): ScheduleEvent | null {
  return selectCanonicalScheduleEvents(events)[0] ?? null;
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
