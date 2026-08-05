import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { ADMIN_LIST_DTAG, SITE_OWNER_PUBKEY } from '../lib/config';
import { queryAllEvents } from '../lib/nostr-pagination';
import { selectFreshTrustedAdminAuthority } from '../lib/trusted-admin';
import {
  SCHEDULE_EVENT_KIND,
  SCHEDULE_EVENT_TOPIC,
  formatScheduleEventDate,
  formatScheduleEventTime,
  getScheduleEventState,
  scheduleEventCoordinate,
  scheduleEventNaddr,
  selectCanonicalScheduleEvents,
  type ScheduleEvent,
} from '../lib/schedule-event';

export interface RssEventSource {
  query(filters: NostrFilter[], options?: { signal?: AbortSignal }): Promise<NostrEvent[]>;
}

export interface SerializeRssOptions {
  siteUrl?: string;
  generatedAt?: Date;
}

export function resolveFreshTrustedAdmins(events: NostrEvent[]): string[] | null {
  return selectFreshTrustedAdminAuthority(events)?.trustedAdmins ?? null;
}

export function canonicalizeTrustedScheduleEvents(
  events: NostrEvent[],
  trustedAdmins: readonly string[],
): ScheduleEvent[] {
  const trusted = new Set(trustedAdmins.map((pubkey) => pubkey.toLowerCase()));
  return selectCanonicalScheduleEvents(
    events.filter((event) => trusted.has(event.pubkey.toLowerCase())),
  );
}

export async function fetchTrustedScheduleEvents(
  source: RssEventSource,
  signal?: AbortSignal,
): Promise<ScheduleEvent[]> {
  const authorityEvents = await source.query([{
    kinds: [30078],
    authors: [SITE_OWNER_PUBKEY],
    '#d': [ADMIN_LIST_DTAG],
    limit: 1,
  }], { signal });
  const trustedAdmins = resolveFreshTrustedAdmins(authorityEvents);
  if (!trustedAdmins) {
    throw new Error('Fresh Site Owner authority could not be resolved');
  }

  const events = await queryAllEvents({
    pageSize: 500,
    queryPage: (until) => source.query([{
      kinds: [SCHEDULE_EVENT_KIND],
      authors: trustedAdmins,
      '#t': [SCHEDULE_EVENT_TOPIC],
      ...(until === undefined ? {} : { until }),
      limit: 500,
    }], { signal }),
  });

  return canonicalizeTrustedScheduleEvents(events, trustedAdmins);
}

export function escapeXml(value: string): string {
  const validXml = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    })
    .join('');

  return validXml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function eventDescription(event: ScheduleEvent): string {
  const lines = [event.summary];
  lines.push(`Date: ${formatScheduleEventDate(event)}`);
  lines.push(`Time: ${formatScheduleEventTime(event)}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.price) lines.push(`Price: ${event.price}`);
  if (event.content) lines.push('', event.content);
  return lines.filter((line, index) => line || index > 0).join('\n');
}

export function serializeRss(
  events: readonly ScheduleEvent[],
  { siteUrl = 'https://runngun.org', generatedAt = new Date() }: SerializeRssOptions = {},
): string {
  const baseUrl = new URL(siteUrl);
  const canonicalSiteUrl = baseUrl.href.replace(/\/$/, '');
  const now = Math.floor(generatedAt.getTime() / 1000);
  const items = [...events]
    .filter((event) => getScheduleEventState(event, now) !== 'past')
    .sort((left, right) =>
      left.start - right.start || scheduleEventCoordinate(left).localeCompare(scheduleEventCoordinate(right))
    )
    .map((event) => {
      const link = new URL(`/${scheduleEventNaddr(event)}`, baseUrl).href;
      return [
        '    <item>',
        `      <title>${escapeXml(event.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${new Date(event.event.created_at * 1000).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(eventDescription(event))}</description>`,
        '      <category>runngun</category>',
        '      <category>biathlon</category>',
        '      <category>shooting</category>',
        '      <category>running</category>',
        '      <dc:creator>runngun.org</dc:creator>',
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>runngun.org - Upcoming Events</title>',
    `    <link>${escapeXml(canonicalSiteUrl)}</link>`,
    '    <description>The official schedule for Run &amp; Gun two-gun biathlon competition events.</description>',
    '    <language>en-us</language>',
    `    <lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(new URL('/rss.xml', baseUrl).href)}" rel="self" type="application/rss+xml"/>`,
    '    <image>',
    `      <url>${escapeXml(new URL('/logo-vector-circle.png', baseUrl).href)}</url>`,
    '      <title>runngun.org</title>',
    `      <link>${escapeXml(canonicalSiteUrl)}</link>`,
    '    </image>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].filter((line) => line !== '').join('\n') + '\n';
}
