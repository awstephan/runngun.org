import { nip19 } from 'nostr-tools';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import {
  Target,
  MapPin,
  Clock,
  Calendar,
  ArrowLeft,
  ExternalLink,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RSVPButton } from '@/components/RSVPButton';
import { RSVPList } from '@/components/RSVPList';
import { CommentForm } from '@/components/CommentForm';
import { CommentSection } from '@/components/CommentSection';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { getAllAdmins } from '@/lib/admins';
import { safeUrl, safeImgUrl } from '@/lib/safeUrl';
import type { NostrEvent } from '@nostrify/nostrify';
import NotFound from './NotFound';

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([t]) => t === name)?.[1];
}

function getAllTags(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([t]) => t === name).map(([, v]) => v).filter(Boolean);
}

function formatFullDate(ts: number, tzid?: string): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tzid,
  });
}

function formatTime(ts: number, tzid?: string): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tzid,
    timeZoneName: 'short',
  });
}

function EventDetailView({ event }: { event: NostrEvent }) {
  const title = getTag(event, 'title') ?? getTag(event, 'name') ?? 'Untitled Event';
  const summary = getTag(event, 'summary') ?? '';
  const image = getTag(event, 'image');
  const safeImage = image ? safeImgUrl(image) : null;
  const location = getTag(event, 'location');
  const price = getTag(event, 'price');
  const startRaw = getTag(event, 'start');
  const endRaw = getTag(event, 'end');
  const tzid = getTag(event, 'start_tzid');
  const links = getAllTags(event, 'r');
  const tags = getAllTags(event, 't');
  const content = event.content;

  const start = startRaw ? parseInt(startRaw) : null;
  const end = endRaw ? parseInt(endRaw) : null;
  const now = Math.floor(Date.now() / 1000);
  const effectiveEnd = end ?? start;
  const isPast = effectiveEnd !== null && effectiveEnd < now;

  useSeoMeta({
    title: `${title} — runngun.org`,
    description: summary || content || `Run & Gun event: ${title}`,
    ogImage: safeImage ?? undefined,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
      <div className="relative isolate">
        {safeImage ? (
          <div className="container mx-auto px-4 max-w-2xl">
            <div className="relative h-56 sm:h-72 overflow-hidden rounded-lg mt-4">
              <img
                src={safeImage}
                alt={title}
                className="w-full h-full object-cover opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            </div>
          </div>
        ) : (
          <div className="container mx-auto px-4 max-w-2xl">
            <div className="h-32 bg-gradient-to-br from-[hsl(220_20%_5%)] via-[hsl(220_15%_8%)] to-[hsl(28_30%_8%)] rounded-lg mt-4">
              <div
                className="h-full opacity-[0.04]"
                style={{
                  backgroundImage:
                    'linear-gradient(hsl(32 95% 52% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(32 95% 52% / 0.3) 1px, transparent 1px)',
                  backgroundSize: '48px 48px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 max-w-2xl pb-16">
        {/* Back link */}
        <div className="py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule
          </Link>
        </div>

        {/* Title */}
        <div className="mt-2">
          {isPast && (
            <Badge variant="outline" className="mb-3 text-xs text-muted-foreground border-muted">
              Past Event
            </Badge>
          )}
          <h1 className="font-condensed text-4xl sm:text-5xl font-bold uppercase tracking-wide text-foreground leading-tight">
            {title}
          </h1>
          {summary && (
            <p className="mt-3 text-base text-muted-foreground leading-relaxed">{summary}</p>
          )}
        </div>

        <div className="mt-1 w-16 h-0.5 bg-primary" />

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs font-condensed uppercase tracking-wide">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Separator className="my-6" />

        {/* Details grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {start && (
            <DetailRow
              icon={<Calendar className="w-4 h-4 text-primary shrink-0" />}
              label="Date"
              value={formatFullDate(start, tzid)}
            />
          )}
          {start && (
            <DetailRow
              icon={<Clock className="w-4 h-4 text-primary shrink-0" />}
              label="Time"
              value={
                end
                  ? `${formatTime(start, tzid)} – ${formatTime(end, tzid)}`
                  : formatTime(start, tzid)
              }
            />
          )}
          {location && (
            <DetailRow
              icon={<MapPin className="w-4 h-4 text-primary shrink-0" />}
              label="Location"
              value={location}
              className="sm:col-span-2"
            />
          )}
          {price && (
            <DetailRow
              icon={<DollarSign className="w-4 h-4 text-primary shrink-0" />}
              label="Price"
              value={price}
            />
          )}
        </div>

        {/* Description */}
        {content && (
          <>
            <Separator className="my-6" />
            <div>
              <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground mb-3">
                About This Event
              </h2>
              <div className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {content}
              </div>
            </div>
          </>
        )}

        {/* Links */}
        {links.length > 0 && (
          <>
            <Separator className="my-6" />
            <div>
              <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground mb-3">
                Links
              </h2>
              <div className="flex flex-col gap-2">
                {links.map((link) => {
                  const safeLink = safeUrl(link);
                  if (!safeLink) return null;
                  return (
                    <a
                      key={link}
                      href={safeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{safeLink}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <Separator className="my-6" />

        {/* RSVP Section */}
        <div>
          <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground mb-4">
            Who's Going
          </h2>
          <RSVPButton eventNaddr={buildNaddr(event)} />
          <div className="mt-4">
            <RSVPListWithData eventNaddr={buildNaddr(event)} />
          </div>
        </div>

        <Separator className="my-6" />

        {/* Comments Section */}
        <div>
          <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground mb-4">
            Comments
          </h2>
          <CommentForm eventId={event.id} authorPubkey={event.pubkey} />
          <div className="mt-4">
            <CommentSection eventId={event.id} authorPubkey={event.pubkey} />
          </div>
        </div>

        {/* Back button */}
        <div className="mt-10">
          <Button variant="outline" asChild className="font-condensed font-bold uppercase tracking-wide">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Schedule
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide font-condensed font-600 mb-0.5">
          {label}
        </div>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

function buildNaddr(event: NostrEvent): string {
  const d = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
  return nip19.naddrEncode({
    kind: 31923,
    pubkey: event.pubkey,
    identifier: d,
  });
}

function RSVPListWithData({ eventNaddr }: { eventNaddr: string }) {
  const { data, isLoading } = useEventRSVPs(eventNaddr);
  if (isLoading) return <div className="text-muted-foreground text-sm">Loading...</div>;
  return <RSVPList going={data?.going ?? []} tentative={data?.tentative ?? []} />;
}

function CalendarEventLoader({ kind, pubkey, identifier }: { kind: number; pubkey: string; identifier: string }) {
  const { nostr } = useNostr();

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['naddr-event', kind, pubkey, identifier],
    queryFn: async (c) => {
      const signal = c.signal as AbortSignal;

      // CRITICAL: Always filter by both author AND d-tag for addressable events
      if (!getAllAdmins().includes(pubkey)) {
        return null; // Reject events from non-admin pubkeys
      }

      const events = await nostr.query(
        [
          {
            kinds: [kind],
            authors: [pubkey],
            '#d': [identifier],
            limit: 1,
          },
        ],
        { signal },
      );

      return events[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-32 bg-muted/20" />
        <div className="container mx-auto px-4 max-w-2xl py-8 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="font-condensed text-2xl font-bold text-foreground">Event Not Found</h2>
          <p className="text-muted-foreground text-sm">
            This event could not be found on the network.
          </p>
          <Button variant="outline" asChild className="font-condensed font-bold uppercase">
            <Link to="/">Back to Schedule</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <EventDetailView event={event} />;
}

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'naddr': {
      const { kind, pubkey, identifier: dTag } = decoded.data;
      if (kind !== 31923) return <NotFound />;
      return (
        <CalendarEventLoader kind={kind} pubkey={pubkey} identifier={dTag} />
      );
    }

    default:
      return <NotFound />;
  }
}
