import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

export interface RSVPEvent {
  event: NostrEvent;
  status: 'going' | 'tentative' | 'accepted';
  pubkey: string;
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([t]) => t === name)?.[1];
}

function parseRSVP(event: NostrEvent): RSVPEvent | null {
  const status = getTag(event, 'status');
  if (!status || (status !== 'going' && status !== 'tentative' && status !== 'accepted')) return null;
  const mappedStatus = status === 'accepted' ? 'going' : status;
  return {
    event,
    status: mappedStatus,
    pubkey: event.pubkey,
  };
}

export function useEventRSVPs(eventNaddr: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['rsvps', eventNaddr, user?.pubkey],
    queryFn: async (c) => {
      const signal = c.signal as AbortSignal;

      const decoded = decodeNaddr(eventNaddr);
      if (!decoded) return { going: [], tentative: [], currentUserStatus: null };

      const { kind, pubkey, identifier } = decoded;
      const aTag = `${kind}:${pubkey}:${identifier}`;

      const events = await nostr.query(
        [
          {
            kinds: [31925],
            '#a': [aTag],
            limit: 100,
          },
        ],
        { signal },
      );

      const rsvps = events
        .map(parseRSVP)
        .filter((r): r is RSVPEvent => r !== null);

      const going = rsvps.filter((r) => r.status === 'going');
      const tentative = rsvps.filter((r) => r.status === 'tentative');

      let currentUserStatus: string | null = null;
      if (user?.pubkey) {
        const userRSVP = rsvps.find((r) => r.pubkey === user.pubkey);
        currentUserStatus = userRSVP?.status ?? null;
      }

      return { going, tentative, currentUserStatus };
    },
    staleTime: 30_000,
  });
}

function decodeNaddr(naddr: string): { kind: number; pubkey: string; identifier: string } | null {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') return null;
    return decoded.data;
  } catch {
    return null;
  }
}

export function useEventRSVPCount(eventNaddr: string) {
  const { data, isLoading } = useEventRSVPs(eventNaddr);
  return {
    goingCount: data?.going.length ?? 0,
    tentativeCount: data?.tentative.length ?? 0,
    isLoading,
  };
}
