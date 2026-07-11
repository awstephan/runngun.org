import { useMemo } from 'react';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { scheduleEventDays, type ScheduleEvent } from '@/lib/schedule-event';

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
  events: ScheduleEvent[];
  year: number;
  month: number;
  daysInMonth: number;
  startDayOfWeek: number;
  prevMonth: { year: number; month: number };
  nextMonth: { year: number; month: number };
}

export function useMonthEvents(year: number, month: number): UseMonthEventsResult {
  const { since, until } = useMemo(() => getMonthRange(year, month), [year, month]);
  const days = useMemo(() => scheduleEventDays(since, until), [since, until]);
  const query = useScheduleEvents({ days, limit: 500 });

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
