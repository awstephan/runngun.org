import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Shield, Github } from 'lucide-react';
import { useMonthEvents } from '@/hooks/useMonthEvents';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EventCard } from '@/components/EventCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ScheduleEvent } from '@/lib/schedule-event';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getInitialMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function groupEventsByDay(
  events: ScheduleEvent[],
  year: number,
  month: number,
): Map<number, ScheduleEvent[]> {
  const map = new Map<number, ScheduleEvent[]>();
  for (const ev of events) {
    for (const dayIndex of ev.days) {
      const date = new Date(Number(dayIndex) * 86_400_000);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month) continue;
      const day = date.getUTCDate();
      const existing = map.get(day) ?? [];
      existing.push(ev);
      map.set(day, existing);
    }
  }
  return map;
}

const Calendar = () => {
  useSeoMeta({
    title: 'Calendar — runngun.org',
    description: 'View all two-gun biathlon event dates on the calendar.',
  });

  const { user } = useCurrentUser();
  const [viewDate, setViewDate] = useState(getInitialMonth);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { events, prevMonth, nextMonth, daysInMonth, startDayOfWeek } = useMonthEvents(
    viewDate.year,
    viewDate.month
  );

  const eventsByDay = useMemo(
    () => groupEventsByDay(events, viewDate.year, viewDate.month),
    [events, viewDate.month, viewDate.year],
  );

  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }, []);

  const isToday = today.year === viewDate.year && today.month === viewDate.month;

  const monthName = MONTH_NAMES[viewDate.month];

  const handlePrevMonth = () => {
    setViewDate({ year: prevMonth.year, month: prevMonth.month });
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setViewDate({ year: nextMonth.year, month: nextMonth.month });
    setSelectedDay(null);
  };

  const handleDayClick = (day: number) => {
    const dayEvents = eventsByDay.get(day);
    if (dayEvents && dayEvents.length > 0) {
      setSelectedDay(day);
    }
  };

  const selectedDayEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  const renderCalendarGrid = () => {
    const cells: JSX.Element[] = [];
    const totalCells = 42; // always 6 rows × 7 cols for consistent height

    // Empty cells for days before the 1st of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push(<div key={`pre-${i}`} className="border-b border-r border-border/50 bg-card/30" />);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = eventsByDay.get(day) ?? [];
      const hasEvents = dayEvents.length > 0;
      const isTodayCell = isToday && today.day === day;

      cells.push(
        <div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`
            border-b border-r border-border/50 bg-card p-1.5 cursor-pointer
            transition-all duration-200 hover:border-primary/50
            ${hasEvents ? 'hover:bg-card/80' : ''}
            ${isTodayCell ? 'bg-primary/5 border-primary/30' : ''}
          `}
          style={{ minHeight: '6rem' }}
        >
          <div className={`
            text-xs font-condensed font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full
            ${isTodayCell ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}
          `}>
            {day}
          </div>
          <div className="space-y-0.5 overflow-y-auto max-h-[calc(100%-24px)] scrollbar-thin">
            {dayEvents.slice(0, 4).map((ev, idx) => (
              <div
                key={`${ev.d}-${idx}`}
                className="text-[10px] leading-tight truncate px-1.5 py-0.5 rounded bg-primary/15 text-foreground/90 border border-primary/20"
                title={ev.title}
              >
                {ev.title.length > 15 ? ev.title.slice(0, 15) + '...' : ev.title}
              </div>
            ))}
            {dayEvents.length > 4 && (
              <div className="text-[10px] text-muted-foreground px-1.5">
                +{dayEvents.length - 4} more
              </div>
            )}
          </div>
        </div>
      );
    }

    // Trailing empty cells to fill remaining grid
    const filled = startDayOfWeek + daysInMonth;
    const trailing = totalCells - filled;
    for (let i = 0; i < trailing; i++) {
      cells.push(<div key={`post-${i}`} className="border-b border-r border-border/50 bg-card/30" style={{ minHeight: '6rem' }} />);
    }
    
    return cells;
  };

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      {/* Header */}
      <header className="relative isolate overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(220_20%_5%)] via-[hsl(220_15%_8%)] to-[hsl(28_30%_8%)]" />
        
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center justify-center w-10 h-10 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors">
                <img src="/logo-vector-circle.png" alt="Run & Gun" className="w-10 h-10 object-contain" />
              </Link>
              <div>
                <h1 className="font-condensed text-2xl font-bold uppercase tracking-wide text-foreground">
                  Event Calendar
                </h1>
                <p className="text-sm text-muted-foreground">
                  Browse upcoming and past events
                </p>
              </div>
            </div>
            
            {user && (
              <Button
                asChild
                size="sm"
                className="font-condensed font-bold uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <a href="/admin">Create Event</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Calendar */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl w-full">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6 w-full">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide text-foreground min-w-[220px] text-center">
            {monthName} {viewDate.year}
          </h2>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 w-full mb-1">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-condensed font-bold uppercase tracking-wider text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 grid-rows-6 w-full border-t border-l border-border rounded-t-lg overflow-hidden">
          {renderCalendarGrid()}
        </div>

        {/* Month quick nav */}
        <div className="mt-8 flex flex-wrap gap-2 justify-center">
          {MONTH_NAMES.map((name, idx) => (
            <Button
              key={name}
              variant={viewDate.month === idx ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewDate({ year: viewDate.year, month: idx })}
              className="text-xs font-condensed"
            >
              {name.slice(0, 3)}
            </Button>
          ))}
        </div>
      </main>

      {/* Day detail dialog */}
      <Dialog open={selectedDay !== null} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-condensed text-xl font-bold uppercase tracking-wide">
              {selectedDay && isToday ? 'Today' : `${monthName} ${selectedDay}, ${viewDate.year}`}
              {selectedDay && !isToday && viewDate.month !== today.month && (
                <span className="text-muted-foreground text-sm font-normal normal-case">
                  {' '}({MONTH_NAMES[viewDate.month]} {selectedDay}, {viewDate.year})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {selectedDayEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No events scheduled for this day.
              </p>
            ) : (
              selectedDayEvents.map((ev) => (
                <EventCard
                  key={ev.event.id}
                  calEvent={ev}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

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

export default Calendar;
