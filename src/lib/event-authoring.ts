import {
  SCHEDULE_EVENT_KIND,
  SCHEDULE_EVENT_TOPIC,
  scheduleEventCoordinate,
  scheduleEventDays,
  type ScheduleEvent,
} from '@/lib/schedule-event';

export interface EventDraft {
  title: string;
  summary: string;
  content: string;
  location: string;
  image: string;
  price: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  tzid: string;
  links: string[];
}

export interface EventTemplateFields {
  title: string;
  summary: string;
  content: string;
  location: string;
  image: string;
  price: string;
  links: string[];
}

interface DraftDateTime {
  date: string;
  time: string;
}

export type DraftEventResult =
  | { ok: true; event: { kind: typeof SCHEDULE_EVENT_KIND; content: string; tags: string[][] } }
  | { ok: false; message: string };

function dateTimeInZone(timestamp: number, timeZone: string): DraftDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function zonedTimestamp(date: string, time: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return null;
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  let instant = desired;

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const actual = dateTimeInZone(Math.floor(instant / 1000), timeZone);
      const [actualYear, actualMonth, actualDay] = actual.date.split('-').map(Number);
      const [actualHour, actualMinute] = actual.time.split(':').map(Number);
      const represented = Date.UTC(actualYear, actualMonth - 1, actualDay, actualHour, actualMinute);
      instant += desired - represented;
    }
    const result = Math.floor(instant / 1000);
    const roundTrip = dateTimeInZone(result, timeZone);
    return roundTrip.date === date && roundTrip.time === time ? result : null;
  } catch {
    return null;
  }
}

export function createEventDraft(
  timeZone: string,
  now = Math.floor(Date.now() / 1000),
): EventDraft {
  const current = dateTimeInZone(now, timeZone);
  return {
    title: '',
    summary: '',
    content: '',
    location: '',
    image: '',
    price: '',
    startDate: current.date,
    startTime: '08:00',
    endDate: current.date,
    endTime: '17:00',
    tzid: timeZone,
    links: [''],
  };
}

export function draftFromScheduleEvent(event: ScheduleEvent): EventDraft {
  const timeZone = event.startTzid ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = dateTimeInZone(event.start, timeZone);
  const end = event.end ? dateTimeInZone(event.end, event.endTzid ?? timeZone) : start;
  return {
    title: event.title,
    summary: event.summary,
    content: event.content,
    location: event.location ?? '',
    image: event.image ?? '',
    price: event.price ?? '',
    startDate: start.date,
    startTime: start.time,
    endDate: event.end ? end.date : '',
    endTime: event.end ? end.time : '',
    tzid: timeZone,
    links: event.links.length > 0 ? event.links : [''],
  };
}

export function draftFromTemplate(
  template: EventTemplateFields,
  timeZone: string,
  now = Math.floor(Date.now() / 1000),
): EventDraft {
  return {
    ...createEventDraft(timeZone, now),
    ...template,
    links: template.links.length > 0 ? template.links : [''],
  };
}

export function templateFieldsFromDraft(draft: EventDraft): EventTemplateFields {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content.trim(),
    location: draft.location.trim(),
    image: draft.image.trim(),
    price: draft.price.trim(),
    links: draft.links.map((link) => link.trim()).filter(Boolean),
  };
}

export function eventFromDraft(draft: EventDraft, identifier: string): DraftEventResult {
  if (!draft.title.trim()) return { ok: false, message: 'Title is required' };
  if (!draft.startDate || !draft.startTime) {
    return { ok: false, message: 'Start date and time are required' };
  }

  const start = zonedTimestamp(draft.startDate, draft.startTime, draft.tzid);
  if (start === null) return { ok: false, message: 'Start date, time, or timezone is invalid' };
  const hasEnd = Boolean(draft.endDate || draft.endTime);
  if (hasEnd && (!draft.endDate || !draft.endTime)) {
    return { ok: false, message: 'End date and time must both be provided' };
  }
  const end = hasEnd ? zonedTimestamp(draft.endDate, draft.endTime, draft.tzid) : undefined;
  if (hasEnd && end === null) return { ok: false, message: 'End date, time, or timezone is invalid' };
  if (end !== undefined && end !== null && end <= start) {
    return { ok: false, message: 'End time must be after start time' };
  }

  const tags: string[][] = [
    ['d', identifier],
    ['title', draft.title.trim()],
    ['start', String(start)],
    ['t', SCHEDULE_EVENT_TOPIC],
    ['t', 'running'],
    ['t', 'shooting'],
    ['t', 'biathlon'],
  ];
  if (draft.summary.trim()) tags.push(['summary', draft.summary.trim()]);
  if (end !== undefined && end !== null) tags.push(['end', String(end)]);
  tags.push(['start_tzid', draft.tzid]);
  if (end !== undefined && end !== null) tags.push(['end_tzid', draft.tzid]);
  if (draft.location.trim()) tags.push(['location', draft.location.trim()]);
  if (draft.image.trim()) tags.push(['image', draft.image.trim()]);
  if (draft.price.trim()) tags.push(['price', draft.price.trim()]);
  for (const link of draft.links.map((value) => value.trim()).filter(Boolean)) {
    tags.push(['r', link]);
  }
  for (const day of scheduleEventDays(start, end ?? undefined)) tags.push(['D', day]);

  return {
    ok: true,
    event: { kind: SCHEDULE_EVENT_KIND, content: draft.content.trim(), tags },
  };
}

export function deletionRequestFor(event: ScheduleEvent) {
  return {
    kind: 5,
    content: 'Deleting schedule event',
    tags: [
      ['e', event.event.id],
      ['a', scheduleEventCoordinate(event)],
    ],
  };
}
