import type { NostrEvent } from '@nostrify/nostrify';

import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '@/lib/config';

const PUBKEY_PATTERN = /^[0-9a-f]{64}$/;

export interface TrustedAdminAuthority {
  freshness: 'fresh' | 'stale';
  trustedAdmins: string[];
  revision: string;
  source: 'nostr' | 'snapshot' | 'owner-bootstrap';
}

export function normalizePubkey(value: string): string | null {
  const normalized = value.toLowerCase();
  return PUBKEY_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeTrustedAdmins(values: string[]): string[] | null {
  const normalized = values.map(normalizePubkey);
  if (normalized.some((pubkey) => pubkey === null)) return null;

  return [
    SITE_OWNER_PUBKEY,
    ...[...new Set(normalized as string[])]
      .filter((pubkey) => pubkey !== SITE_OWNER_PUBKEY)
      .sort(),
  ];
}

export function parseAuthorityEvent(event: NostrEvent): TrustedAdminAuthority | null {
  if (
    event.kind !== 30078 ||
    event.pubkey.toLowerCase() !== SITE_OWNER_PUBKEY ||
    !event.tags.some(([name, value]) => name === 'd' && value === ADMIN_LIST_DTAG)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.content);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) return null;
    const trustedAdmins = normalizeTrustedAdmins(parsed);
    if (!trustedAdmins) return null;
    return {
      freshness: 'fresh',
      trustedAdmins,
      revision: event.id,
      source: 'nostr',
    };
  } catch {
    return null;
  }
}

export function selectFreshTrustedAdminAuthority(events: NostrEvent[]): TrustedAdminAuthority | null {
  const candidates = events.filter((event) =>
    event.kind === 30078 &&
    event.pubkey.toLowerCase() === SITE_OWNER_PUBKEY &&
    event.tags.some(([name, value]) => name === 'd' && value === ADMIN_LIST_DTAG)
  );
  candidates.sort((left, right) =>
    right.created_at - left.created_at || left.id.localeCompare(right.id)
  );
  return candidates[0] ? parseAuthorityEvent(candidates[0]) : null;
}
