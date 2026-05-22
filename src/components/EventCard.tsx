import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { MapPin, Clock, ExternalLink, Calendar, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { safeImgUrl } from '@/lib/safeUrl';

interface EventCardProps {
  calEvent: CalendarEvent;
  isPast?: boolean;
}

function formatEventDate(start: number, end?: number, tzid?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tzid,
  };
  const startStr = new Date(start * 1000).toLocaleDateString('en-US', opts);

  if (!end) return startStr;

  const endDate = new Date(end * 1000);
  const startDate = new Date(start * 1000);
  const sameDay =
    startDate.toDateString() === endDate.toDateString();

  if (sameDay) return startStr;

  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tzid,
  });
  return `${startStr} – ${endStr}`;
}

function formatEventTime(start: number, end?: number, tzid?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tzid,
    timeZoneName: tzid ? 'short' : undefined,
  };
  const startStr = new Date(start * 1000).toLocaleTimeString('en-US', opts);
  if (!end) return startStr;

  const endOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tzid,
    timeZoneName: tzid ? 'short' : undefined,
  };
  const endStr = new Date(end * 1000).toLocaleTimeString('en-US', endOpts);
  return `${startStr} – ${endStr}`;
}

function getMonthAbbr(start: number): string {
  return new Date(start * 1000).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function getDayNum(start: number): string {
  return new Date(start * 1000).toLocaleDateString('en-US', { day: 'numeric' });
}

export function EventCard({ calEvent, isPast = false }: EventCardProps) {
  const { event, title, summary, start, end, startTzid, location, image: rawImage, price } = calEvent;
  const image = rawImage ? safeImgUrl(rawImage) : null;

  // Build naddr for the detail link (CRITICAL: must include author for secure filtering)
  const naddr = nip19.naddrEncode({
    kind: 31923,
    pubkey: event.pubkey,
    identifier: calEvent.d,
  });

  const dateStr = formatEventDate(start, end, startTzid);
  const timeStr = formatEventTime(start, end, startTzid);
  const monthAbbr = getMonthAbbr(start);
  const dayNum = getDayNum(start);

  return (
    <Link
      to={`/${naddr}`}
      className={`group block ${isPast ? 'opacity-60 hover:opacity-80' : ''} transition-opacity duration-200`}
    >
      <div className={`
        relative flex gap-0 rounded-lg border overflow-hidden
        transition-all duration-300 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10
        ${isPast
          ? 'border-border bg-card/40'
          : 'border-border bg-card hover:-translate-y-0.5'
        }
      `}>
        {/* Left: Date badge */}
        <div className={`
          flex flex-col items-center justify-center px-5 py-4 min-w-[72px] shrink-0
          ${isPast ? 'bg-muted/30' : 'bg-primary/10 border-r border-primary/20'}
        `}>
          <span className={`
            font-condensed text-xs font-700 tracking-widest uppercase
            ${isPast ? 'text-muted-foreground' : 'text-primary'}
          `}>
            {monthAbbr}
          </span>
          <span className={`
            font-condensed text-3xl font-bold leading-none
            ${isPast ? 'text-muted-foreground' : 'text-foreground'}
          `}>
            {dayNum}
          </span>
        </div>

        {/* Center: Event details */}
        <div className="flex-1 px-5 py-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`
              font-condensed text-xl font-bold tracking-wide leading-tight truncate
              transition-colors duration-200
              ${isPast
                ? 'text-foreground/60'
                : 'text-foreground group-hover:text-primary'
              }
            `}>
              {title}
            </h3>
            {isPast && (
              <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground border-muted">
                Past
              </Badge>
            )}
          </div>

          {summary && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {summary}
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              {dateStr}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              {timeStr}
            </span>
            {location && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-xs">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{location}</span>
              </span>
            )}
          </div>
          {price && (
            <div className="mt-1 text-xs text-primary font-medium">
              {price}
            </div>
          )}
        </div>

        {/* Right: Event image (if present) */}
        {image && (
          <div className="hidden sm:block w-[130px] shrink-0 overflow-hidden">
            <img
              src={image}
              alt={title}
              className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
            />
          </div>
        )}

        {/* Hover arrow indicator */}
        <div className={`
          hidden sm:flex items-center justify-center px-3 shrink-0
          text-muted-foreground group-hover:text-primary transition-colors duration-200
          ${image ? 'hidden' : ''}
        `}>
          <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>

        {/* Active left border accent */}
        {!isPast && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/0 group-hover:bg-primary transition-all duration-300" />
        )}
      </div>
    </Link>
  );
}

/** Skeleton loading state for EventCard */
export function EventCardSkeleton() {
  return (
    <div className="flex gap-0 rounded-lg border border-border bg-card overflow-hidden animate-pulse">
      <div className="flex flex-col items-center justify-center px-5 py-4 min-w-[72px] bg-primary/5">
        <div className="h-3 w-8 bg-muted rounded mb-1" />
        <div className="h-8 w-6 bg-muted rounded" />
      </div>
      <div className="flex-1 px-5 py-4">
        <div className="h-5 w-3/4 bg-muted rounded mb-2" />
        <div className="h-3 w-full bg-muted rounded mb-1" />
        <div className="h-3 w-2/3 bg-muted rounded" />
        <div className="mt-2 flex gap-4">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-3 w-20 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
