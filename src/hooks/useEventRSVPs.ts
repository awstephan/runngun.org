import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { queryAllEvents } from '@/lib/nostr-pagination';
import { SCHEDULE_EVENT_KIND } from '@/lib/schedule-event';

export type RSVPStatus = 'going' | 'tentative' | 'declined';

export interface RSVPEvent {
  event: NostrEvent;
  status: RSVPStatus;
  pubkey: string;
}

export interface ScheduleCoordinate {
  kind: number;
  pubkey: string;
  identifier: string;
  value: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;

export const rsvpQueryKeys = {
  all: ['nostr', 'rsvps'] as const,
  event: (eventNaddr: string, userPubkey: string | undefined) =>
    [...rsvpQueryKeys.all, eventNaddr, userPubkey] as const,
};

function tagsNamed(event: NostrEvent, name: string): string[][] {
  return event.tags.filter(([tag]) => tag === name);
}

function singleTag(event: NostrEvent, name: string): string | undefined {
  const tags = tagsNamed(event, name);
  return tags.length === 1 ? tags[0][1] : undefined;
}

export function decodeScheduleCoordinate(naddr: string): ScheduleCoordinate | null {
  try {
    const decoded = nip19.decode(naddr);
    if (
      decoded.type !== 'naddr' ||
      decoded.data.kind !== SCHEDULE_EVENT_KIND ||
      !HEX_64.test(decoded.data.pubkey) ||
      !decoded.data.identifier
    ) {
      return null;
    }
    return {
      ...decoded.data,
      value: `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`,
    };
  } catch {
    return null;
  }
}

export function parseRSVP(event: NostrEvent, coordinate: ScheduleCoordinate): RSVPEvent | null {
  if (event.kind !== 31925 || singleTag(event, 'a') !== coordinate.value || !singleTag(event, 'd')) {
    return null;
  }

  const status = singleTag(event, 'status');
  if (!status || !['accepted', 'tentative', 'declined'].includes(status)) return null;

  const revisionId = singleTag(event, 'e');
  if (revisionId !== undefined && !HEX_64.test(revisionId)) return null;

  const eventAuthor = singleTag(event, 'p');
  if (eventAuthor !== undefined && eventAuthor !== coordinate.pubkey) return null;

  const mappedStatus: RSVPStatus = status === 'accepted' ? 'going' : status as RSVPStatus;
  return {
    event,
    status: mappedStatus,
    pubkey: event.pubkey,
  };
}

export function canonicalizeRSVPs(events: NostrEvent[], coordinate: ScheduleCoordinate): RSVPEvent[] {
  const latestByAuthor = new Map<string, RSVPEvent>();
  for (const event of events) {
    const rsvp = parseRSVP(event, coordinate);
    if (!rsvp) continue;
    const current = latestByAuthor.get(rsvp.pubkey);
    if (
      !current ||
      rsvp.event.created_at > current.event.created_at ||
      (rsvp.event.created_at === current.event.created_at && rsvp.event.id < current.event.id)
    ) {
      latestByAuthor.set(rsvp.pubkey, rsvp);
    }
  }
  return [...latestByAuthor.values()];
}

export function useEventRSVPs(eventNaddr: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: rsvpQueryKeys.event(eventNaddr, user?.pubkey),
    queryFn: async ({ signal }) => {
      const coordinate = decodeScheduleCoordinate(eventNaddr);
      if (!coordinate) return { going: [], tentative: [], currentUserStatus: null };

      const events = await queryAllEvents({
        pageSize: 500,
        queryPage: (until) => nostr.query([{
          kinds: [31925],
          '#a': [coordinate.value],
          ...(until === undefined ? {} : { until }),
          limit: 500,
        }], { signal }),
      });
      const rsvps = canonicalizeRSVPs(events, coordinate);
      const going = rsvps.filter((rsvp) => rsvp.status === 'going');
      const tentative = rsvps.filter((rsvp) => rsvp.status === 'tentative');
      const userRSVP = user ? rsvps.find((rsvp) => rsvp.pubkey === user.pubkey) : undefined;
      const currentUserStatus = userRSVP?.status === 'declined' ? null : userRSVP?.status ?? null;

      return { going, tentative, currentUserStatus };
    },
    staleTime: 30_000,
  });
}

export function useEventRSVPCount(eventNaddr: string) {
  const { data, isLoading } = useEventRSVPs(eventNaddr);
  return {
    goingCount: data?.going.length ?? 0,
    tentativeCount: data?.tentative.length ?? 0,
    isLoading,
  };
}
