import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';

import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';
import {
  normalizePubkey,
  normalizeTrustedAdmins,
  parseAuthorityEvent,
  type TrustedAdminAuthority,
} from '@/lib/trusted-admin';

const AUTHORITY_QUERY_KEY = ['trusted-admin-authority', SITE_OWNER_PUBKEY] as const;
const SNAPSHOT_STORAGE_KEY = 'runngun:trusted-admin-authority:v1';
interface PersistedAuthority {
  version: 1;
  siteOwner: string;
  trustedAdmins: string[];
  revision: string;
}

type TrustedFilter = Omit<NostrFilter, 'authors'>;

function readSnapshot(): TrustedAdminAuthority {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') throw new Error('Missing snapshot');

    const snapshot = parsed as Partial<PersistedAuthority>;
    if (
      snapshot.version !== 1 ||
      snapshot.siteOwner !== SITE_OWNER_PUBKEY ||
      typeof snapshot.revision !== 'string' ||
      !Array.isArray(snapshot.trustedAdmins) ||
      !snapshot.trustedAdmins.every((value) => typeof value === 'string')
    ) {
      throw new Error('Invalid snapshot');
    }

    const trustedAdmins = normalizeTrustedAdmins(snapshot.trustedAdmins);
    if (!trustedAdmins) throw new Error('Invalid snapshot pubkeys');

    return {
      freshness: 'stale',
      trustedAdmins,
      revision: snapshot.revision,
      source: 'snapshot',
    };
  } catch {
    return {
      freshness: 'stale',
      trustedAdmins: [SITE_OWNER_PUBKEY],
      revision: `owner:${SITE_OWNER_PUBKEY}`,
      source: 'owner-bootstrap',
    };
  }
}

function persistAuthority(authority: TrustedAdminAuthority): void {
  const snapshot: PersistedAuthority = {
    version: 1,
    siteOwner: SITE_OWNER_PUBKEY,
    trustedAdmins: authority.trustedAdmins,
    revision: authority.revision,
  };
  localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.removeItem('nostr:admins');
  localStorage.removeItem('runngun:admin-list');
}

export function useTrustedAdmin() {
  const { nostr } = useNostr();
  const authorityQuery = useQuery({
    queryKey: AUTHORITY_QUERY_KEY,
    queryFn: async ({ signal }) => {
      try {
        const events = await nostr.query(
          [{
            kinds: [30078],
            authors: [SITE_OWNER_PUBKEY],
            '#d': [ADMIN_LIST_DTAG],
            limit: 1,
          }],
          { signal },
        );
        const authority = events[0] ? parseAuthorityEvent(events[0]) : null;
        if (!authority) return readSnapshot();

        persistAuthority(authority);
        return authority;
      } catch {
        return readSnapshot();
      }
    },
    staleTime: 60_000,
    refetchOnMount: true,
  });

  const authority = authorityQuery.data;
  const trustedSet = new Set(authority?.trustedAdmins);
  const queryTrusted = useCallback(async (
    filters: readonly TrustedFilter[],
    options?: { signal?: AbortSignal },
  ) => {
    if (!authority) throw new Error('Trusted Admin authority is unresolved');
    const events = await nostr.query(
      filters.map((filter) => ({ ...filter, authors: authority.trustedAdmins })),
      options,
    );
    const resolvedTrustedSet = new Set(authority.trustedAdmins);
    return events.filter((event) => resolvedTrustedSet.has(event.pubkey.toLowerCase()));
  }, [authority, nostr]);

  return {
    ...authorityQuery,
    authority,
    accessFor(pubkey: string | undefined) {
      if (!pubkey) return { status: 'anonymous' as const };
      const normalized = normalizePubkey(pubkey);
      if (!normalized || !trustedSet.has(normalized)) return { status: 'denied' as const };
      return {
        status: 'trusted-admin' as const,
        isSiteOwner: normalized === SITE_OWNER_PUBKEY,
      };
    },
    queryTrusted,
  };
}

export { AUTHORITY_QUERY_KEY, normalizePubkey, normalizeTrustedAdmins, parseAuthorityEvent, persistAuthority };
export type { TrustedAdminAuthority } from '@/lib/trusted-admin';
