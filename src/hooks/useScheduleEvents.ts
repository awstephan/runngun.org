import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import { queryAllEvents } from '@/lib/nostr-pagination';
import {
  SCHEDULE_EVENT_KIND,
  SCHEDULE_EVENT_TOPIC,
  selectCanonicalScheduleEvent,
  selectCanonicalScheduleEvents,
} from '@/lib/schedule-event';

interface UseScheduleEventsOptions {
  days?: string[];
  limit?: number;
}

const SCHEDULE_PAGE_SIZE = 100;

interface SchedulePageParam {
  until?: number;
  seenAtTimestamp: string[];
}

export const scheduleQueryKeys = {
  all: ['schedule-events'] as const,
  list: (revision: string | undefined, days: string[] | undefined, limit: number) =>
    [...scheduleQueryKeys.all, 'list', revision, days?.join(',') ?? 'all', limit] as const,
  infinite: (revision: string | undefined, pageSize: number) =>
    [...scheduleQueryKeys.all, 'infinite', revision, pageSize] as const,
  event: (revision: string | undefined, author: string, identifier: string) =>
    [...scheduleQueryKeys.all, 'event', revision, author, identifier] as const,
};

export function useScheduleEvents({ days, limit = 100 }: UseScheduleEventsOptions = {}) {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;

  return useQuery({
    queryKey: scheduleQueryKeys.list(authority?.revision, days, limit),
    queryFn: async ({ signal }) => {
      const events = await queryAllEvents({
        pageSize: limit,
        queryPage: (until) => trustedAdmin.queryTrusted([{
          kinds: [SCHEDULE_EVENT_KIND],
          '#t': [SCHEDULE_EVENT_TOPIC],
          ...(days ? { '#D': days } : {}),
          ...(until === undefined ? {} : { until }),
          limit,
        }], { signal }),
      });

      return selectCanonicalScheduleEvents(events);
    },
    enabled: Boolean(authority),
    staleTime: 60_000,
  });
}

export function useScheduleEvent(author: string, identifier: string) {
  const { nostr } = useNostr();
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;
  const isTrustedAuthor = trustedAdmin.accessFor(author).status === 'trusted-admin';

  return useQuery({
    queryKey: scheduleQueryKeys.event(authority?.revision, author, identifier),
    queryFn: async ({ signal }) => {
      if (!isTrustedAuthor) return null;
      const events = await nostr.query([{
        kinds: [SCHEDULE_EVENT_KIND],
        authors: [author],
        '#d': [identifier],
        '#t': [SCHEDULE_EVENT_TOPIC],
      }], { signal });
      return selectCanonicalScheduleEvent(events);
    },
    enabled: Boolean(authority),
    staleTime: 60_000,
  });
}

export function useInfiniteScheduleEvents(pageSize = SCHEDULE_PAGE_SIZE) {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;

  return useInfiniteQuery({
    queryKey: scheduleQueryKeys.infinite(authority?.revision, pageSize),
    queryFn: async ({ pageParam, signal }) => {
      const page = await trustedAdmin.queryTrusted([{
        kinds: [SCHEDULE_EVENT_KIND],
        '#t': [SCHEDULE_EVENT_TOPIC],
        ...(pageParam.until === undefined ? {} : { until: pageParam.until }),
        limit: pageSize,
      }], { signal });
      if (
        page.length === pageSize &&
        pageParam.until !== undefined &&
        page.every((event) =>
          event.created_at === pageParam.until && pageParam.seenAtTimestamp.includes(event.id)
        )
      ) {
        throw new Error(`Relay pagination saturated at created_at ${pageParam.until}`);
      }
      return page;
    },
    initialPageParam: { seenAtTimestamp: [] } as SchedulePageParam,
    getNextPageParam: (page, pages) => {
      if (page.length < pageSize) return undefined;
      const oldest = Math.min(...page.map((event) => event.created_at));
      return {
        until: oldest,
        seenAtTimestamp: pages
          .flat()
          .filter((event) => event.created_at === oldest)
          .map((event) => event.id),
      };
    },
    select: (data) => ({
      ...data,
      events: selectCanonicalScheduleEvents(data.pages.flat()),
    }),
    enabled: Boolean(authority),
    staleTime: 60_000,
  });
}
