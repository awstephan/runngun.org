import { useEffect } from 'react';

export default function FeedRedirect() {
  useEffect(() => {
    window.location.replace('/rss.xml');
  }, []);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <p className="text-muted-foreground">
        Opening the <a className="text-primary underline" href="/rss.xml">RSS feed</a>...
      </p>
    </main>
  );
}
