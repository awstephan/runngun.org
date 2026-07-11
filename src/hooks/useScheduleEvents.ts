import { useQuery } from '@tanstack/react-query';

import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import {
  SCHEDULE_EVENT_KIND,
  SCHEDULE_EVENT_TOPIC,
  parseScheduleEvent,
  scheduleEventCoordinate,
  type ScheduleEvent,
} from '@/lib/schedule-event';

interface UseScheduleEventsOptions {
  days?: string[];
  limit?: number;
}

export function useScheduleEvents({ days, limit = 100 }: UseScheduleEventsOptions = {}) {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;
  const daysKey = days?.join(',') ?? 'all';

  return useQuery({
    queryKey: ['schedule-events', authority?.revision, daysKey, limit],
    queryFn: async ({ signal }) => {
      const events = await trustedAdmin.queryTrusted(
        [{
          kinds: [SCHEDULE_EVENT_KIND],
          '#t': [SCHEDULE_EVENT_TOPIC],
          ...(days ? { '#D': days } : {}),
          limit,
        }],
        { signal },
      );

      const parsed = events
        .map(parseScheduleEvent)
        .filter((event): event is ScheduleEvent => event !== null);
      const latestByCoordinate = new Map<string, ScheduleEvent>();

      for (const event of parsed) {
        const coordinate = scheduleEventCoordinate(event);
        const current = latestByCoordinate.get(coordinate);
        if (
          !current ||
          event.event.created_at > current.event.created_at ||
          (event.event.created_at === current.event.created_at && event.event.id > current.event.id)
        ) {
          latestByCoordinate.set(coordinate, event);
        }
      }

      return [...latestByCoordinate.values()].sort((left, right) => left.start - right.start);
    },
    enabled: Boolean(authority),
    staleTime: 60_000,
  });
}
