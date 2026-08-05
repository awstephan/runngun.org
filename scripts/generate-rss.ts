import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { NPool, NRelay1 } from '@nostrify/nostrify';

import type { ScheduleEvent } from '../src/lib/schedule-event';
import { fetchTrustedScheduleEvents, serializeRss } from '../src/rss/rss-feed';

const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

function relayUrlsFromEnvironment(): string[] {
  const configured = process.env.RSS_RELAYS?.split(',').map((url) => url.trim()).filter(Boolean);
  const relays = [...new Set(configured?.length ? configured : DEFAULT_RELAYS)];
  if (!relays.every((url) => /^wss?:\/\//.test(url))) {
    throw new Error('RSS_RELAYS must be a comma-separated list of ws:// or wss:// URLs');
  }
  return relays;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = resolve(
    directory,
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function closePool(pool: NPool): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    pool.close(),
    new Promise<void>((resolveClose) => {
      timeout = setTimeout(resolveClose, 1_000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

async function main(): Promise<void> {
  const relays = relayUrlsFromEnvironment();
  const outputPath = resolve(process.env.RSS_OUTPUT_PATH ?? 'dist/rss.xml');
  const pool = new NPool({
    open: (url) => new NRelay1(url, { backoff: false }),
    reqRouter: (filters) => new Map(relays.map((url) => [url, filters])),
    eventRouter: () => [],
    eoseTimeout: 1_500,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let events: ScheduleEvent[];
  try {
    events = await fetchTrustedScheduleEvents(pool, controller.signal);
  } finally {
    clearTimeout(timeout);
    await closePool(pool);
  }

  const feed = serializeRss(events);
  await atomicWrite(outputPath, feed);
  console.log(`Wrote ${events.length} trusted Schedule Events to ${outputPath}`);
}

await main().catch((error: unknown) => {
  console.error('RSS generation failed; the previous feed was left unchanged.', error);
  process.exitCode = 1;
});
