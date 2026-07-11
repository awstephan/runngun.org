import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Target, Shield, Zap, ChevronDown, ChevronUp, Globe, Key, Server, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { partitionScheduleEvents } from '@/lib/schedule-event';
import { EventCard, EventCardSkeleton } from '@/components/EventCard';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [showNostrInfo, setShowNostrInfo] = useState(false);

  useSeoMeta({
    title: 'runngun.org — Two-Gun Biathlon Events',
    description:
      'The official schedule for Run & Gun two-gun biathlon competition events. Race hard, shoot straight.',
  });

  const { data: events, isLoading, isError } = useScheduleEvents();
  const partition = events ? partitionScheduleEvents(events) : { upcoming: [], 'in-progress': [], past: [] };
  const upcoming = [...partition['in-progress'], ...partition.upcoming];

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <header className="relative isolate overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(220_20%_5%)] via-[hsl(220_15%_8%)] to-[hsl(28_30%_8%)]" />
        <div className="absolute inset-0 -z-10 scanlines" />
        {/* Amber glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 -z-10 w-[600px] h-[400px] rounded-full bg-primary/8 blur-[80px]" />
        {/* Grid texture */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(32 95% 52% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(32 95% 52% / 0.3) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="container mx-auto px-4 pt-8 sm:pt-12 text-center">
          {/* Logo */}
          <img
            src="/logo-vector-circle.png"
            alt="Run & Gun"
            className="w-28 h-28 mx-auto mb-6 animate-fade-in object-contain"
          />

          {/* Wordmark */}
          <h1 className="font-condensed text-6xl sm:text-8xl font-bold tracking-tight text-foreground uppercase animate-fade-in-up">
            runngun.org
          </h1>
          <div className="mt-2 mx-auto w-24 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />

          <p className="mt-5 font-condensed text-xl sm:text-2xl text-primary uppercase tracking-[0.25em] font-600 animate-fade-in-up">
            Two-Gun Biathlon Events
          </p>

          <p className="mt-4 max-w-xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed animate-fade-in">
            Run hard. Shoot straight. Compete in the most demanding multi-discipline shooting
            sport — combining pistol and rifle marksmanship with a timed run course.
          </p>

          {/* CTA row */}
          <div className="mt-8 pb-8 flex flex-wrap gap-3 items-center justify-center animate-fade-in">
            <Button
              size="lg"
              className="font-condensed text-lg font-bold tracking-wide uppercase bg-primary text-primary-foreground hover:bg-primary/90 px-8"
              asChild
            >
              <a href="/schedule">View Schedule</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-condensed text-lg font-bold tracking-wide uppercase border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 px-8"
              asChild
            >
              <a href="/calendar">View Calendar</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-condensed text-lg font-bold tracking-wide uppercase border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 px-8"
              asChild
            >
              <a href="/map">View Map</a>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Event Schedule ──────────────────────────────────────── */}
      <main id="events" className="container mx-auto px-4 py-12 max-w-3xl">

        {/* Upcoming Events */}
        <section>
          <SectionHeader label="Upcoming Events" accent />

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

          {!isLoading && !isError && upcoming.length > 0 && (
            <>
              <div className="space-y-3">
                {upcoming.slice(0, 10).map((ev) => (
                  <EventCard key={ev.event.id} calEvent={ev} />
                ))}
              </div>
              {upcoming.length > 10 && (
                <div className="mt-6 text-center">
                  <Button asChild variant="outline" className="font-condensed font-bold uppercase tracking-wide">
                    <Link to="/schedule">See Them All ({upcoming.length} Events)</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* ── Powered by Nostr ──────────────────────────────────────── */}
      <section className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="rounded-lg border border-border bg-card/50">
          <button
            onClick={() => setShowNostrInfo((v) => !v)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-card/80 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground">
                  Powered by Nostr
                </h2>
                <p className="text-sm text-muted-foreground">
                  Decentralized. Censorship-resistant. You own your data.
                </p>
              </div>
            </div>
            {showNostrInfo ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          
          {showNostrInfo && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                runngun.org runs on Nostr, a decentralized protocol that's fundamentally different from traditional platforms.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Key className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Your identity, your keys</span>
                    <p className="text-xs text-muted-foreground">No usernames or passwords — just a keypair that identifies you across the entire network.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Server className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Your data, your relays</span>
                    <p className="text-xs text-muted-foreground">Choose which servers store your content. Your data isn't locked into any single platform.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">No central authority</span>
                    <p className="text-xs text-muted-foreground">Anyone can publish. No account approval needed. No one can silence you.</p>
                  </div>
                </div>
              </div>
              <a
                href="https://jumble.social"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Get Started on Jumble
                <Zap className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
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
              href="https://github.com/awstephan/runngun.org"
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

function SectionHeader({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <img src="/logo-vector-circle.png" alt="" className="w-6 h-6 object-contain shrink-0" />
      {accent && <div className="w-1 h-6 bg-primary rounded-full shrink-0" />}
      <h2 className={`
        font-condensed text-2xl font-bold uppercase tracking-wide
        ${accent ? 'text-foreground' : 'text-muted-foreground'}
      `}>
        {label}
      </h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/30 py-12 px-8 text-center">
      <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

export default Index;
