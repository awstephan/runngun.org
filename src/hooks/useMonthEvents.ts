import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { validateCalendarEvent, parseCalendarEvent } from './useCalendarEvents';
import type { CalendarEvent } from './useCalendarEvents';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return {
    since: Math.floor(start.getTime() / 1000),
    until: Math.floor(end.getTime() / 1000),
  };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthStartDay(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getPrevMonth(year: number, month: number) {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

function getNextMonth(year: number, month: number) {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

interface UseMonthEventsResult {
  events: CalendarEvent[];
  year: number;
  month: number;
  daysInMonth: number;
  startDayOfWeek: number;
  prevMonth: { year: number; month: number };
  nextMonth: { year: number; month: number };
}

export function useMonthEvents(year: number, month: number): UseMonthEventsResult {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;

  const { since, until } = useMemo(() => getMonthRange(year, month), [year, month]);

  const query = useQuery({
    queryKey: ['month-events', year, month, authority?.revision],
    queryFn: async ({ signal }) => {
      const startOfRange = new Date(year - 1, 0, 1).getTime() / 1000;
      const endOfRange = new Date(year + 2, 0, 0, 23, 59, 59).getTime() / 1000;

      const events = await trustedAdmin.queryTrusted(
        [
          {
            kinds: [31923],
            '#t': ['runngun'],
            since: startOfRange,
            until: endOfRange,
            limit: 500,
          },
        ],
        { signal },
      );

      return events
        .filter(validateCalendarEvent)
        .map(parseCalendarEvent)
        .filter((ev) => {
          const evStart = ev.start;
          return evStart >= since && evStart < until;
        })
        .sort((a, b) => a.start - b.start);
    },
    enabled: Boolean(authority),
    staleTime: 30_000,
  });

  return {
    events: query.data ?? [],
    year,
    month,
    daysInMonth: getDaysInMonth(year, month),
    startDayOfWeek: getMonthStartDay(year, month),
    prevMonth: getPrevMonth(year, month),
    nextMonth: getNextMonth(year, month),
  };
}

export { getMonthStartDay, getDaysInMonth };
