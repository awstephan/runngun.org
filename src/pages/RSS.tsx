import { useEffect, useState } from 'react';

import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { getScheduleEventState, scheduleEventNaddr } from '@/lib/schedule-event';

function safeCDATA(s: string): string {
  return s.replace(/]]>/g, ']]]]><![CDATA[>');
}

const RSS = () => {
  const { data: events, isLoading, isError } = useScheduleEvents({ limit: 50 });
  const [feed, setFeed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!events) return;

    const generateRSS = async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const upcoming = events
          .filter((event) => getScheduleEventState(event, now) !== 'past');

        const siteUrl = 'https://runngun.org';
        const buildDate = new Date().toUTCString();

        const items = upcoming.map((ev) => {
          const { title, summary, content, location, price, start, end } = ev;
          const naddr = scheduleEventNaddr(ev);
          const link = `${siteUrl}/${naddr}`;
          const pubDate = new Date(start * 1000).toUTCString();
          const startDate = new Date(start * 1000).toISOString();
          const endDate = end ? new Date(end * 1000).toISOString() : '';

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
  }, [events]);

  if (isError) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <p className="text-destructive">Failed to generate RSS feed</p>
      </div>
    );
  }

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

  if (isLoading || !feed) {
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
