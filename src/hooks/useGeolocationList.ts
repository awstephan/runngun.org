import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SITE_OWNER_PUBKEY, GEOLOCATION_DTAG } from '@/lib/config';

export interface GeocodedLocation {
  location: string;
  lat: number;
  lng: number;
}

const STORAGE_KEY = 'runngun:geolocation-cache';

function getInitialData(): Record<string, GeocodedLocation> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function useGeolocationList() {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['geolocation-list', SITE_OWNER_PUBKEY],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [30078],
            authors: [SITE_OWNER_PUBKEY],
            '#d': [GEOLOCATION_DTAG],
            limit: 1,
          },
        ],
        { signal }
      );

      const locations: Record<string, GeocodedLocation> = {};

      if (events.length > 0) {
        const event = events[0];
        for (const tag of event.tags) {
          if (tag[0] === 'g' && tag[1] && tag[2] && tag[3]) {
            const location = tag[1].toLowerCase().trim();
            const lat = parseFloat(tag[2]);
            const lng = parseFloat(tag[3]);
            if (!isNaN(lat) && !isNaN(lng)) {
              locations[location] = { location, lat, lng };
            }
          }
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
      } catch {
        // Ignore storage errors
      }

      return locations;
    },
    staleTime: 60 * 60 * 1000,
    placeholderData: getInitialData(),
  });

  return query;
}
