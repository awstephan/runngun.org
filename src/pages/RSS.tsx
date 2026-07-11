import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';

import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';

function safeCDATA(s: string): string {
  return s.replace(/]]>/g, ']]]]><![CDATA[>');
}

const RSS = () => {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;
  const queryTrusted = trustedAdmin.queryTrusted;
  const [feed, setFeed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authority) return;

    const generateRSS = async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const events = await queryTrusted([
          {
            kinds: [31923],
            '#t': ['runngun', 'running', 'shooting', 'biathlon'],
            since: now - 365 * 24 * 3600,
            limit: 50,
          },
        ]);

        const upcoming = events
          .filter((ev) => {
            const start = parseInt(ev.tags.find(([k]) => k === 'start')?.[1] || '0');
            return start > now;
          })
          .sort((a, b) => {
            const startA = parseInt(a.tags.find(([k]) => k === 'start')?.[1] || '0');
            const startB = parseInt(b.tags.find(([k]) => k === 'start')?.[1] || '0');
            return startA - startB;
          });

        const siteUrl = 'https://runngun.org';
        const buildDate = new Date().toUTCString();

        const items = upcoming.map((ev) => {
          const d = ev.tags.find(([k]) => k === 'd')?.[1] || '';
          const title = ev.tags.find(([k]) => k === 'title')?.[1] || 'Untitled Event';
          const summary = ev.tags.find(([k]) => k === 'summary')?.[1] || '';
          const content = ev.content || '';
          const location = ev.tags.find(([k]) => k === 'location')?.[1] || '';
          const price = ev.tags.find(([k]) => k === 'price')?.[1] || '';
          const start = parseInt(ev.tags.find(([k]) => k === 'start')?.[1] || '0');
          const end = ev.tags.find(([k]) => k === 'end')?.[1];

          const naddr = nip19.naddrEncode({
            kind: 31923,
            pubkey: ev.pubkey,
            identifier: d,
          });
          const link = `${siteUrl}/${naddr}`;
          const pubDate = new Date(start * 1000).toUTCString();
          const startDate = new Date(start * 1000).toISOString();
          const endDate = end ? new Date(parseInt(end) * 1000).toISOString() : '';

          let description = '';
          if (summary) description += `${summary}\n`;
          if (start) description += `Date: ${new Date(start * 1000).toLocaleDateString()}\n`;
          if (endDate) description += `Ends: ${endDate}\n`;
          if (location) description += `Location: ${location}\n`;
          if (price) description += `Price: ${price}\n`;
          if (content) description += `\n${content}`;

          return `
    <item>
      <title><![CDATA[${safeCDATA(title)}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${safeCDATA(description)}]]></description>
      <category>runngun</category>
      <category>biathlon</category>
      <category>shooting</category>
      <category>running</category>
      <dc:creator>runngun.org</dc:creator>
      ${start ? `<startDate>${startDate}</startDate>` : ''}
      ${endDate ? `<endDate>${endDate}</endDate>` : ''}
    </item>`;
        }).join('');

        const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>runngun.org - Upcoming Events</title>
    <link>https://runngun.org</link>
    <description>The official schedule for Run &amp; Gun two-gun biathlon competition events.</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <managingEditor>admin@runngun.org</managingEditor>
    <webMaster>admin@runngun.org</webMaster>
    <atom:link href="https://runngun.org/feed" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://runngun.org/logo-vector-circle.png</url>
      <title>runngun.org</title>
      <link>https://runngun.org</link>
    </image>
    ${items}
  </channel>
</rss>`;

        setFeed(rssFeed);
      } catch (err) {
        console.error('RSS generation error:', err);
        setError('Failed to generate RSS feed');
      }
    };

    generateRSS();
  }, [authority, queryTrusted]);

  if (error) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <a href="/" className="text-primary hover:underline mt-4 block">← Return home</a>
        </div>
      </div>
    );
  }

  if (!feed) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Generating RSS feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-condensed text-2xl font-bold uppercase">RSS Feed</h1>
          <a href="/" className="text-muted-foreground hover:text-primary">← Back to site</a>
        </div>
        <pre className="bg-card border border-border p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
          {feed}
        </pre>
        <p className="text-muted-foreground text-sm mt-4">
          Copy this URL into your RSS reader: <code className="bg-muted px-2 py-1 rounded">https://runngun.org/feed</code>
        </p>
      </div>
    </div>
  );
};

export default RSS;
