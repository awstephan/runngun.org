import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Target, Shield, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCalendarEvents, splitEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { EventCard, EventCardSkeleton } from '@/components/EventCard';

const PAGE_SIZE = 10;

const Schedule = () => {
  useSeoMeta({
    title: 'Schedule — runngun.org',
    description: 'View the complete two-gun biathlon event schedule.',
  });

  const { data: events, isLoading, isError } = useCalendarEvents();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { upcoming } = events ? splitEvents(events) : { upcoming: [] };

  const visibleEvents = useMemo(() => {
    return upcoming.slice(0, visibleCount);
  }, [upcoming, visibleCount]);

  const hasMore = visibleCount < upcoming.length;

  const handleLoadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => prev + PAGE_SIZE);
    }
  }, [hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, handleLoadMore]);

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(220_20%_5%)] via-[hsl(220_15%_8%)] to-[hsl(28_30%_8%)]" />
        
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center justify-center w-10 h-10 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors">
                <img src="/logo-vector-circle.png" alt="Run & Gun" className="w-10 h-10 object-contain" />
              </Link>
              <div>
                <h1 className="font-condensed text-2xl font-bold uppercase tracking-wide text-foreground">
                  Event Schedule
                </h1>
                <p className="text-sm text-muted-foreground">
                  All upcoming events
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Event List */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-primary rounded-full shrink-0" />
            <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide text-foreground">
              Upcoming Events
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          )}

          {isError && (
            <EmptyState message="Could not load events. Check your relay connections." />
          )}

          {!isLoading && !isError && upcoming.length === 0 && (
            <EmptyState message="No upcoming events scheduled. Check back soon!" />
          )}

          {!isLoading && !isError && visibleEvents.length > 0 && (
            <div className="space-y-3">
              {visibleEvents.map((ev) => (
                <EventCard key={ev.event.id} calEvent={ev} />
              ))}
            </div>
          )}

          {/* Load more trigger */}
          {hasMore && !isLoading && (
            <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Loading more events...
              </div>
            </div>
          )}

          {!hasMore && visibleEvents.length > 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              All events loaded
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20 py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo-vector-circle.png" alt="Run & Gun" className="w-6 h-6 object-contain" />
            <span className="font-condensed font-bold tracking-wide uppercase text-foreground">
              runngun.org
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <a
              href="https://github.com/MartialM1nd/runngun.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/30 py-12 px-8 text-center">
      <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

export default Schedule;