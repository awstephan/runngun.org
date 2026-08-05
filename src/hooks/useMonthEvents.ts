import { useMemo } from 'react';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import {
  scheduleEventIntersectsMonth,
  scheduleMonthQueryDays,
  type ScheduleEvent,
} from '@/lib/schedule-event';

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
  isLoading: boolean;
  isError: boolean;
  year: number;
  month: number;
  daysInMonth: number;
  startDayOfWeek: number;
  prevMonth: { year: number; month: number };
  nextMonth: { year: number; month: number };
}

export function useMonthEvents(year: number, month: number): UseMonthEventsResult {
  const days = useMemo(() => scheduleMonthQueryDays(year, month), [year, month]);
  const query = useScheduleEvents({ days, limit: 500 });

  return {
    events: (query.data ?? []).filter((event) => scheduleEventIntersectsMonth(event, year, month)),
    isLoading: query.isLoading,
    isError: query.isError,
    year,
    month,
    daysInMonth: getDaysInMonth(year, month),
    startDayOfWeek: getMonthStartDay(year, month),
    prevMonth: getPrevMonth(year, month),
    nextMonth: getNextMonth(year, month),
  };
}

export { getMonthStartDay, getDaysInMonth };
