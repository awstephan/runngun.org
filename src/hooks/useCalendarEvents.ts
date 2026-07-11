import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';

export interface CalendarEvent {
  event: NostrEvent;
  d: string;
  title: string;
  summary: string;
  content: string;
  start: number;
  end: number | undefined;
  startTzid: string | undefined;
  location: string | undefined;
  image: string | undefined;
  price: string | undefined;
  links: string[];
  tags: string[];
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([t]) => t === name)?.[1];
}

function getAllTags(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([t]) => t === name).map(([, v]) => v).filter(Boolean);
}

export function validateCalendarEvent(event: NostrEvent): boolean {
  if (event.kind !== 31923) return false;

  const d = getTag(event, 'd');
  const title = getTag(event, 'title');
  const start = getTag(event, 'start');

  if (!d || !title || !start) return false;

  const startTs = parseInt(start);
  if (isNaN(startTs) || startTs <= 0) return false;

  return true;
}

export function parseCalendarEvent(event: NostrEvent): CalendarEvent {
  const d = getTag(event, 'd') ?? '';
  const title = getTag(event, 'title') ?? getTag(event, 'name') ?? 'Untitled Event';
  const summary = getTag(event, 'summary') ?? '';
  const content = event.content;
  const start = parseInt(getTag(event, 'start') ?? '0');
  const endRaw = getTag(event, 'end');
  const end = endRaw ? parseInt(endRaw) : undefined;
  const startTzid = getTag(event, 'start_tzid');
  const location = getTag(event, 'location');
  const image = getTag(event, 'image');
  const price = getTag(event, 'price');
  const links = getAllTags(event, 'r');
  const tags = getAllTags(event, 't');

  return {
    event,
    d,
    title,
    summary,
    content,
    start,
    end,
    startTzid,
    location,
    image,
    price,
    links,
    tags,
  };
}

export function useCalendarEvents() {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;

  return useQuery({
    queryKey: ['calendar-events', 'kind:31923', authority?.revision],
    queryFn: async (c) => {
      const signal = c.signal as AbortSignal;
      const events = await trustedAdmin.queryTrusted(
        [
          {
            kinds: [31923],
            '#t': ['runngun'],
            limit: 100,
          },
        ],
        { signal },
      );

      return events
        .filter(validateCalendarEvent)
        .map(parseCalendarEvent)
        .sort((a, b) => a.start - b.start);
    },
    enabled: Boolean(authority),
    staleTime: 60_000,
  });
}

/** Separate upcoming vs past */
export function splitEvents(events: CalendarEvent[]): {
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
} {
  const now = Math.floor(Date.now() / 1000);
  const upcoming: CalendarEvent[] = [];
  const past: CalendarEvent[] = [];

  for (const ev of events) {
    // Use end time if available, otherwise use start time
    const effectiveEnd = ev.end ?? ev.start;
    if (effectiveEnd >= now) {
      upcoming.push(ev);
    } else {
      past.push(ev);
    }
  }

  return { upcoming, past: past.reverse() };
}
