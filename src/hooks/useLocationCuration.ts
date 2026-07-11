import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { GEOLOCATION_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { discoverLocation } from '@/hooks/useLocationResolutions';
import { useToast } from '@/hooks/useToast';
import {
  locationRecordTags,
  normalizeLocation,
  parseLocationRecord,
  readLocationCache,
  writeLocationCache,
  type LocationResolution,
} from '@/lib/location-resolution';

export function useLocationCuration() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSiteOwner = user?.pubkey.toLowerCase() === SITE_OWNER_PUBKEY;

  const curateLocation = async (location: string): Promise<void> => {
    if (!user || !isSiteOwner || !location.trim()) return;

    try {
      const events = await nostr.query([
        {
          kinds: [30078],
          authors: [SITE_OWNER_PUBKEY],
          '#d': [GEOLOCATION_DTAG],
          limit: 1,
        },
      ]);
      const current = events[0] ? parseLocationRecord(events[0]) : {};
      if (!current) throw new Error('The current location record is invalid');

      const normalized = normalizeLocation(location);
      if (current[normalized]) return;

      const cache = readLocationCache();
      const discovered = await discoverLocation(location, cache);
      writeLocationCache(cache);
      if (!discovered) {
        toast({
          title: 'Location not resolved',
          description: `Could not find coordinates for "${location}"`,
          variant: 'destructive',
        });
        return;
      }
      if (discovered.precision !== 'exact') return;

      const curated: LocationResolution = { ...discovered, source: 'curated' };
      const next = { ...current, [normalized]: curated };
      const signed = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(Object.keys(next)),
        tags: [
          ['d', GEOLOCATION_DTAG],
          ['alt', 'runngun.org location resolutions'],
          ...locationRecordTags(next),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await nostr.event(signed, { signal: AbortSignal.timeout(10_000) });

      cache.curated = next;
      cache.curatedRevision = signed.id;
      writeLocationCache(cache);
      await queryClient.invalidateQueries({ queryKey: ['location-resolutions'] });
      toast({ title: 'Location curated', description: `Saved coordinates for "${location}"` });
    } catch (error) {
      console.error('Failed to curate location:', error);
      toast({ title: 'Failed to curate location', variant: 'destructive' });
    }
  };

  return { curateLocation, isSiteOwner };
}
