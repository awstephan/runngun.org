import type { NostrEvent } from '@nostrify/nostrify';

import { GEOLOCATION_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';

export const LOCATION_CACHE_KEY = 'runngun:location-resolutions:v1';
export const LOCATION_TAG = 'location';
export const FAILED_LOOKUP_TTL = 24 * 60 * 60 * 1000;

export interface LocationResolution {
  location: string;
  lat: number;
  lng: number;
  precision: 'exact' | 'approximate';
  source: 'curated' | 'discovered';
}

interface DiscoveryRecord {
  resolution: LocationResolution | null;
  expiresAt: number | null;
}

export interface LocationCache {
  version: 1;
  curatedRevision: string | null;
  curated: Record<string, LocationResolution>;
  discoveries: Record<string, DiscoveryRecord>;
}

export function isCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function normalizeLocation(location: string): string {
  return location.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseResolution(
  location: string,
  rawLat: string,
  rawLng: string,
  precision: string | undefined,
): LocationResolution | null {
  const normalized = normalizeLocation(location);
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!normalized || !isCoordinate(lat, lng)) return null;

  return {
    location: normalized,
    lat,
    lng,
    precision: precision === 'approximate' ? 'approximate' : 'exact',
    source: 'curated',
  };
}

export function parseLocationRecord(event: NostrEvent): Record<string, LocationResolution> | null {
  if (
    event.kind !== 30078 ||
    event.pubkey.toLowerCase() !== SITE_OWNER_PUBKEY ||
    !event.tags.some(([name, value]) => name === 'd' && value === GEOLOCATION_DTAG)
  ) {
    return null;
  }

  const resolutions: Record<string, LocationResolution> = {};
  for (const tag of event.tags) {
    let resolution: LocationResolution | null = null;
    if (tag[0] === LOCATION_TAG && tag[1] && tag[2] && tag[3]) {
      resolution = parseResolution(tag[1], tag[2], tag[3], tag[4]);
    } else if (tag[0] === 'g' && tag[1] && tag[2] && tag[3]) {
      resolution = parseResolution(tag[1], tag[2], tag[3], 'exact');
    }
    if (resolution) resolutions[resolution.location] = resolution;
  }
  return resolutions;
}

export function emptyLocationCache(): LocationCache {
  return { version: 1, curatedRevision: null, curated: {}, discoveries: {} };
}

function readLegacyLocationCache(): LocationCache {
  const cache = emptyLocationCache();
  try {
    const curated: unknown = JSON.parse(localStorage.getItem('runngun:geolocation-cache') ?? 'null');
    if (curated && typeof curated === 'object') {
      for (const [key, value] of Object.entries(curated)) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as { lat?: unknown; lng?: unknown };
        if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') continue;
        if (!isCoordinate(entry.lat, entry.lng)) continue;
        const location = normalizeLocation(key);
        cache.curated[location] = {
          location,
          lat: entry.lat,
          lng: entry.lng,
          precision: 'exact',
          source: 'curated',
        };
      }
      if (Object.keys(cache.curated).length > 0) cache.curatedRevision = 'legacy';
    }

    const discovered: unknown = JSON.parse(localStorage.getItem('runngun:location-cache') ?? 'null');
    if (discovered && typeof discovered === 'object') {
      for (const [key, value] of Object.entries(discovered)) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as { lat?: unknown; lng?: unknown };
        if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') continue;
        if (!isCoordinate(entry.lat, entry.lng)) continue;
        const location = normalizeLocation(key);
        cache.discoveries[location] = {
          resolution: {
            location,
            lat: entry.lat,
            lng: entry.lng,
            precision: 'exact',
            source: 'discovered',
          },
          expiresAt: null,
        };
      }
    }
  } catch {
    return emptyLocationCache();
  }
  return cache;
}

export function readLocationCache(): LocationCache {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return readLegacyLocationCache();
    const cache = value as Partial<LocationCache>;
    if (cache.version !== 1 || !cache.curated || !cache.discoveries) {
      return emptyLocationCache();
    }
    const validated = emptyLocationCache();
    validated.curatedRevision = typeof cache.curatedRevision === 'string'
      ? cache.curatedRevision
      : null;

    for (const [key, value] of Object.entries(cache.curated)) {
      if (
        value &&
        value.location === key &&
        value.source === 'curated' &&
        (value.precision === 'exact' || value.precision === 'approximate') &&
        isCoordinate(value.lat, value.lng)
      ) {
        validated.curated[key] = value;
      }
    }
    for (const [key, record] of Object.entries(cache.discoveries)) {
      if (!record || (record.expiresAt !== null && typeof record.expiresAt !== 'number')) continue;
      if (record.resolution === null) {
        validated.discoveries[key] = record;
        continue;
      }
      const value = record.resolution;
      if (
        value.location === key &&
        value.source === 'discovered' &&
        (value.precision === 'exact' || value.precision === 'approximate') &&
        isCoordinate(value.lat, value.lng)
      ) {
        validated.discoveries[key] = record;
      }
    }
    return validated;
  } catch {
    return emptyLocationCache();
  }
}

export function writeLocationCache(cache: LocationCache): void {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cache));
    localStorage.removeItem('runngun:geolocation-cache');
    localStorage.removeItem('runngun:location-cache');
  } catch {
    // Resolution remains usable for this session when persistence is unavailable.
  }
}

export function locationRecordTags(resolutions: Record<string, LocationResolution>): string[][] {
  return Object.values(resolutions)
    .sort((left, right) => left.location.localeCompare(right.location))
    .map((resolution) => [
      LOCATION_TAG,
      resolution.location,
      String(resolution.lat),
      String(resolution.lng),
      resolution.precision,
    ]);
}

export function locationCandidates(location: string): string[] {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [location.trim()];
  return parts.map((_, index) => parts.slice(index).join(', '));
}

export function cachedDiscovery(
  cache: LocationCache,
  location: string,
  now = Date.now(),
): LocationResolution | null | undefined {
  const record = cache.discoveries[normalizeLocation(location)];
  if (!record) return undefined;
  if (record.expiresAt !== null && record.expiresAt <= now) return undefined;
  return record.resolution;
}
