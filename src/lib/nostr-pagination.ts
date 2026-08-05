import type { NostrEvent } from '@nostrify/nostrify';

interface QueryAllEventsOptions {
  pageSize: number;
  queryPage: (until: number | undefined) => Promise<NostrEvent[]>;
}

export class NostrPaginationError extends Error {
  constructor(timestamp: number) {
    super(`Relay pagination saturated at created_at ${timestamp}`);
    this.name = 'NostrPaginationError';
  }
}

/** Walk a Nostr created_at cursor without immediately skipping its inclusive boundary. */
export async function queryAllEvents({ pageSize, queryPage }: QueryAllEventsOptions): Promise<NostrEvent[]> {
  const events = new Map<string, NostrEvent>();
  let until: number | undefined;

  while (true) {
    const page = await queryPage(until);
    let added = 0;
    for (const event of page) {
      if (!events.has(event.id)) added++;
      events.set(event.id, event);
    }
    if (page.length < pageSize) break;

    const oldest = Math.min(...page.map((event) => event.created_at));
    if (until === oldest && added === 0) {
      // Nostr has no event-id cursor within a timestamp. Failing is safer than
      // silently skipping an unknown remainder of the saturated cohort.
      throw new NostrPaginationError(oldest);
    }
    until = oldest;
  }

  return [...events.values()];
}
