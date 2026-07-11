import { useState, useEffect, useRef } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import L from 'leaflet';

import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { getScheduleEventState, scheduleEventNaddr, type ScheduleEvent } from '@/lib/schedule-event';
import { useGeolocationList } from '@/hooks/useGeolocationList';
import { Button } from '@/components/ui/button';

interface GeocodedLocation {
  lat: number;
  lng: number;
}

const GEOCODE_CACHE_KEY = 'runngun:location-cache';

function getGeocodeCache(): Record<string, GeocodedLocation> {
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function setGeocodeCache(cache: Record<string, GeocodedLocation>) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore
  }
}

function extractAddressParts(location: string): string[] {
  const parts = location.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length <= 1) return [location];

  const candidates: string[] = [location];
  for (let i = parts.length - 1; i >= 1; i--) {
    candidates.push(parts.slice(i).join(', '));
  }
  return candidates;
}

async function geocodeLocation(location: string, nostrLocations: Record<string, GeocodedLocation>): Promise<GeocodedLocation | null> {
  const cache = getGeocodeCache();
  const cacheKey = location.toLowerCase().trim();

  if (nostrLocations[cacheKey]) {
    cache[cacheKey] = nostrLocations[cacheKey];
    setGeocodeCache(cache);
    return nostrLocations[cacheKey];
  }

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const addressCandidates = extractAddressParts(location);
  for (const candidate of addressCandidates) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(candidate)}&limit=1`,
        {
          headers: {
            'User-Agent': 'runngun.org/1.0 (admin@runngun.org)',
            'Accept': 'application/json',
          },
        }
      );

      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      if (!response.ok) continue;

      const data = await response.json();
      if (!data || data.length === 0) continue;

      const result: GeocodedLocation = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };

      cache[cacheKey] = result;
      setGeocodeCache(cache);

      return result;
    } catch {
      continue;
    }
  }

  return null;
}

function createMarkerIcon(isPast: boolean): L.DivIcon {
  const color = isPast ? '#6b7280' : '#dc5522';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:16px; height:16px; border-radius:50%; border:3px solid ${color}; background:transparent; box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function buildPopupContent(calEvent: ScheduleEvent): string {
  const naddr = scheduleEventNaddr(calEvent);

  const dateStr = new Date(calEvent.start * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');

  return `
    <div style="background: #1a1a1a; color: #e5e5e5; border: none; box-shadow: none;">
      <a href="/${naddr}" style="font-weight: bold; font-size: 14px; color: #fff; text-decoration: none;">
        ${escapeHtml(calEvent.title)}
      </a>
      <div style="font-size: 12px; color: #999; margin-top: 4px;">${dateStr}</div>
      ${calEvent.location ? `<div style="font-size: 12px; color: #999; margin-top: 4px;">${escapeHtml(calEvent.location)}</div>` : ''}
      <a href="/${naddr}" style="font-size: 12px; color: #dc5522; text-decoration: none; margin-top: 8px; display: block;">
        View Details →
      </a>
    </div>
  `;
}

interface MapViewProps {
  events: ScheduleEvent[];
  locations: Record<string, GeocodedLocation>;
}

function MapView({ events, locations }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [39.8283, -98.5795],
      zoom: 4,
      zoomControl: true,
    });

    // Dark mode tiles from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Style popup wrapper whenever a popup opens
    map.on('popupopen', () => {
      document.querySelectorAll('.leaflet-popup-content-wrapper').forEach((el) => {
        (el as HTMLElement).style.cssText = 'background:#1a1a1a !important; border:none !important; border-radius:8px !important; box-shadow:0 4px 20px rgba(0,0,0,0.6) !important; padding:8px 0 !important;';
      });
      document.querySelectorAll('.leaflet-popup-tip').forEach((el) => {
        (el as HTMLElement).style.cssText = 'background:#1a1a1a !important; border:none !important; box-shadow:none !important;';
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const validLocations: [number, number][] = [];

    // Count how many events land on each coordinate so we can spread duplicates
    const coordCount: Record<string, number> = {};
    const coordIndex: Record<string, number> = {};

    events.forEach((ev) => {
      if (!ev.location) return;
      const cacheKey = ev.location.toLowerCase().trim();
      const loc = locations[cacheKey];
      if (!loc) return;
      const key = `${loc.lat},${loc.lng}`;
      coordCount[key] = (coordCount[key] ?? 0) + 1;
    });

    const OFFSET = 0.018; // degrees (~1.5km) — enough to visually separate at zoom 4-8

    events.forEach((ev) => {
      if (!ev.location) return;
      const cacheKey = ev.location.toLowerCase().trim();
      const loc = locations[cacheKey];
      if (!loc) return;

      const key = `${loc.lat},${loc.lng}`;
      const total = coordCount[key] ?? 1;
      const idx = coordIndex[key] ?? 0;
      coordIndex[key] = idx + 1;

      // Arrange duplicates in a small circle around the true point
      let lat = loc.lat;
      let lng = loc.lng;
      if (total > 1) {
        const angle = (2 * Math.PI * idx) / total;
        lat = loc.lat + OFFSET * Math.sin(angle);
        lng = loc.lng + OFFSET * Math.cos(angle);
      }

      validLocations.push([lat, lng]);

      const isPast = getScheduleEventState(ev) === 'past';

      const marker = L.marker([lat, lng], {
        icon: createMarkerIcon(isPast),
      }).addTo(map);

      marker.bindPopup(buildPopupContent(ev));
      markersRef.current.push(marker);
    });

    // Auto-fit bounds to show all markers
    if (validLocations.length > 0) {
      const bounds = L.latLngBounds(validLocations);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [events, locations]);

  return <div ref={mapContainerRef} className="absolute inset-0" />;
}

export default function MapPage() {
  useSeoMeta({
    title: 'Map — runngun.org',
    description: 'View all Run & Gun events on an interactive map.',
  });

  const { data: events, isLoading: eventsLoading } = useScheduleEvents();
  const { data: nostrLocations, isLoading: nostrLoading } = useGeolocationList();
  const [locations, setLocations] = useState<Record<string, GeocodedLocation>>({});
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [progress, setProgress] = useState(0);

  const allEvents = events ?? [];
  const eventsWithLocation = allEvents.filter((ev) => ev.location);

  useEffect(() => {
    // Wait until both events and Nostr locations are loaded before deciding what to geocode
    if (eventsLoading || nostrLoading) return;
    if (!eventsWithLocation.length) return;

    // Build merged lookup: Nostr geolocations take priority, then localStorage cache
    const localCache = getGeocodeCache();
    const mergedCache: Record<string, GeocodedLocation> = { ...localCache };

    if (nostrLocations) {
      Object.entries(nostrLocations).forEach(([key, loc]) => {
        mergedCache[key] = loc; // Nostr wins
      });
    }

    const uniqueLocs = [...new Set(eventsWithLocation.map((ev) => ev.location!.toLowerCase().trim()))];
    const needGeocoding = uniqueLocs.filter((loc) => !mergedCache[loc]);

    if (needGeocoding.length === 0) {
      setLocations(mergedCache);
      return;
    }

    setIsGeocoding(true);
    setProgress(0);

    let cancelled = false;

    const geocodeAll = async () => {
      for (let i = 0; i < needGeocoding.length; i++) {
        if (cancelled) return;
        setProgress(((i + 1) / needGeocoding.length) * 100);

        const loc = needGeocoding[i];
        const originalLocation = eventsWithLocation.find(
          (ev) => ev.location!.toLowerCase().trim() === loc
        )?.location;

        if (originalLocation) {
          const result = await geocodeLocation(originalLocation, nostrLocations || {});
          if (result) {
            mergedCache[loc] = result;
          }
        }
      }

      if (!cancelled) {
        setLocations({ ...mergedCache });
        setIsGeocoding(false);
      }
    };

    geocodeAll();

    return () => {
      cancelled = true;
    };
  }, [eventsLoading, nostrLoading, eventsWithLocation.length]);

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <header className="relative isolate overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(220_20%_5%)] via-[hsl(220_15%_8%)] to-[hsl(28_30%_8%)]" />
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center justify-center w-10 h-10 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors">
                <img src="/logo-vector-circle.png" alt="Run & Gun" className="w-10 h-10 object-contain" />
              </Link>
              <div>
                <h1 className="font-condensed text-2xl font-bold uppercase tracking-wide text-foreground">
                  EVENT MAP
                </h1>
                <p className="text-sm text-muted-foreground">Interactive map of events</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/schedule">
                <Button variant="ghost" size="sm" className="font-condensed uppercase">Schedule</Button>
              </Link>
              <Link to="/">
                <Button variant="ghost" size="sm" className="font-condensed uppercase">Home</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <MapView events={eventsWithLocation} locations={locations} />

        {eventsLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[1000]">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          </div>
        )}

        {!eventsLoading && isGeocoding && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[1000]">
            <div className="text-center w-64">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">Geocoding locations...</p>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{Math.round(progress)}%</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 z-[1000]">
          <div className="text-xs font-condensed font-bold uppercase text-muted-foreground mb-2">Legend</div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span>Upcoming</span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span>Past</span>
          </div>
        </div>

        <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 z-[1000]">
          <div className="text-xs font-condensed font-bold">{eventsWithLocation.length} events with locations</div>
        </div>
      </main>

      <footer className="border-t border-border py-4 shrink-0">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo-vector-circle.png" alt="Run & Gun" className="w-6 h-6 object-contain" />
            <span className="font-condensed font-bold tracking-wide uppercase text-foreground">runngun.org</span>
          </div>
          <Link to="/admin" className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <span className="text-xs">Admin</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
