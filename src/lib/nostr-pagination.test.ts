import type { NostrEvent } from '@nostrify/nostrify';
import { describe, expect, it, vi } from 'vitest';

import { NostrPaginationError, queryAllEvents } from '@/lib/nostr-pagination';

function event(id: string, createdAt: number): NostrEvent {
  return {
    id: id.repeat(64),
    pubkey: 'a'.repeat(64),
    created_at: createdAt,
    kind: 1,
    tags: [],
    content: '',
    sig: 'b'.repeat(128),
  };
}

describe('queryAllEvents', () => {
  it('retries an inclusive timestamp boundary before moving behind it', async () => {
    const newest = event('1', 20);
    const newer = event('5', 15);
    const boundary = event('2', 10);
    const otherBoundary = event('3', 10);
    const oldest = event('4', 5);
    const queryPage = vi.fn(async (until: number | undefined) => {
      if (until === undefined) return [newest, newer, boundary];
      if (until === 10) return [boundary, otherBoundary, oldest];
      return [oldest];
    });

    const events = await queryAllEvents({ pageSize: 3, queryPage });

    expect(events.map(({ id }) => id)).toEqual([newest.id, newer.id, boundary.id, otherBoundary.id, oldest.id]);
    expect(queryPage).toHaveBeenCalledWith(10);
    expect(queryPage).toHaveBeenCalledWith(5);
  });

  it('fails instead of skipping an event cohort saturated at one timestamp', async () => {
    const first = event('1', 10);
    const second = event('2', 10);
    const queryPage = vi.fn(async () => [first, second]);

    await expect(queryAllEvents({ pageSize: 2, queryPage })).rejects.toBeInstanceOf(NostrPaginationError);
  });
});
