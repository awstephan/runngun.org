import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { GEOLOCATION_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';
import {
  FAILED_LOOKUP_TTL,
  cachedDiscovery,
  locationCandidates,
  isCoordinate,
  normalizeLocation,
  parseLocationRecord,
  readLocationCache,
  writeLocationCache,
  type LocationCache,
  type LocationResolution,
} from '@/lib/location-resolution';

let nominatimQueue = Promise.resolve();
let lastNominatimRequest = 0;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

interface NominatimResult {
  lat: string;
  lon: string;
}

function parseNominatimResult(value: unknown): NominatimResult | null {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') return null;
  const result = value[0] as Partial<NominatimResult>;
  return typeof result.lat === 'string' && typeof result.lon === 'string'
    ? { lat: result.lat, lon: result.lon }
    : null;
}

async function requestNominatim(query: string, signal?: AbortSignal): Promise<NominatimResult | null> {
  const task = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1_100 - (Date.now() - lastNominatimRequest));
    if (wait > 0) await sleep(wait, signal);
    signal?.throwIfAborted();
    lastNominatimRequest = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '1');
    url.searchParams.set('email', 'admin@runngun.org');
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    return parseNominatimResult(await response.json());
  });
  nominatimQueue = task.then(() => undefined, () => undefined);
  return task;
}

async function discoverLocation(
  location: string,
  cache: LocationCache,
  signal?: AbortSignal,
): Promise<LocationResolution | null> {
  const normalized = normalizeLocation(location);
  const cached = cachedDiscovery(cache, normalized);
  if (cached !== undefined) return cached;

  const candidates = locationCandidates(location);
  for (const [index, candidate] of candidates.entries()) {
    const result = await requestNominatim(candidate, signal);
    if (!result) continue;
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (!isCoordinate(lat, lng)) continue;

    const resolution: LocationResolution = {
      location: normalized,
      lat,
      lng,
      precision: index === 0 ? 'exact' : 'approximate',
      source: 'discovered',
    };
    cache.discoveries[normalized] = { resolution, expiresAt: null };
    return resolution;
  }

  cache.discoveries[normalized] = {
    resolution: null,
    expiresAt: Date.now() + FAILED_LOOKUP_TTL,
  };
  return null;
}

export function useLocationResolutions(locations: string[]) {
  const { nostr } = useNostr();
  const normalizedLocations = [...new Set(locations.map(normalizeLocation).filter(Boolean))].sort();
  const locationsKey = normalizedLocations.join('|');

  return useQuery({
    queryKey: ['location-resolutions', SITE_OWNER_PUBKEY, locationsKey],
    queryFn: async ({ signal }) => {
      const cache = readLocationCache();
      try {
        const events = await nostr.query(
          [{
            kinds: [30078],
            authors: [SITE_OWNER_PUBKEY],
            '#d': [GEOLOCATION_DTAG],
            limit: 1,
          }],
          { signal },
        );
        const curated = events[0] ? parseLocationRecord(events[0]) : null;
        if (curated) {
          cache.curated = curated;
          cache.curatedRevision = events[0].id;
        }
      } catch {
        // The last validated curated snapshot remains authoritative offline.
      }

      const resolutions: Record<string, LocationResolution> = {};
      for (const location of normalizedLocations) {
        if (cache.curated[location]) {
          resolutions[location] = cache.curated[location];
          continue;
        }
        const discovered = await discoverLocation(location, cache, signal);
        if (discovered) resolutions[location] = discovered;
      }
      writeLocationCache(cache);
      return resolutions;
    },
    staleTime: 60 * 60 * 1000,
  });
}

export { discoverLocation };
