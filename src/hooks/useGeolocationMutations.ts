import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { GEOLOCATION_DTAG } from '@/lib/config';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { SITE_OWNER_PUBKEY } from '@/lib/config';
import type { GeocodedLocation } from './useGeolocationList';

const GEOCODE_CACHE_KEY = 'runngun:location-cache';

function getLocalCache(): Record<string, GeocodedLocation> {
  try {
    const stored = localStorage.getItem(GEOCODE_CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

async function geocodeLocation(location: string): Promise<GeocodedLocation | null> {
  const cache = getLocalCache();
  const cacheKey = location.toLowerCase().trim();

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const result: GeocodedLocation = {
      location,
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };

    cache[cacheKey] = result;
    try {
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore
    }

    return result;
  } catch {
    return null;
  }
}

export function useGeolocationMutations() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isOwner = user ? user.pubkey.toLowerCase() === SITE_OWNER_PUBKEY.toLowerCase() : false;

  const geocodeAndSaveLocation = async (locationString: string) => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'You must be logged in', variant: 'destructive' });
      return;
    }

    if (!isOwner) {
      toast({ title: 'Not authorized', description: 'Only site owner can save geolocations', variant: 'destructive' });
      return;
    }

    if (!locationString || locationString.trim().length === 0) {
      return;
    }

    try {
      const events = await nostr.query([
        { kinds: [30078], authors: [SITE_OWNER_PUBKEY], '#d': [GEOLOCATION_DTAG], limit: 1 },
      ]);

      const existingLocations: Record<string, GeocodedLocation> = {};

      if (events.length > 0) {
        const event = events[0];
        for (const tag of event.tags) {
          if (tag[0] === 'g' && tag[1] && tag[2] && tag[3]) {
            const loc = tag[1].toLowerCase().trim();
            existingLocations[loc] = {
              location: loc,
              lat: parseFloat(tag[2]),
              lng: parseFloat(tag[3]),
            };
          }
        }
      }

      const cacheKey = locationString.toLowerCase().trim();

      if (existingLocations[cacheKey]) {
        return;
      }

      const geocoded = await geocodeLocation(locationString);
      if (!geocoded) {
        toast({ title: 'Geocoding failed', description: `Could not find coordinates for "${locationString}"`, variant: 'destructive' });
        return;
      }

      existingLocations[cacheKey] = {
        location: cacheKey,
        lat: geocoded.lat,
        lng: geocoded.lng,
      };

      const gTags: string[][] = Object.values(existingLocations).map(
        (loc) => ['g', loc.location, loc.lat.toString(), loc.lng.toString()] as [string, string, string, string]
      );

      const signed = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(Object.keys(existingLocations)),
        tags: [
          ['d', GEOLOCATION_DTAG],
          ['alt', 'runngun.org geolocations'],
          ...gTags,
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10000) });
      queryClient.invalidateQueries({ queryKey: ['geolocation-list'] });

      toast({ title: 'Location saved', description: `Coordinates saved for "${locationString}"` });
    } catch (error) {
      console.error('Failed to save geolocation:', error);
      toast({ title: 'Failed to save geolocation', variant: 'destructive' });
    }
  };

  return { geocodeAndSaveLocation, isOwner };
}