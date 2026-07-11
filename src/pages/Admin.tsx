import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import {
  CalendarPlus,
  Calendar,
  Wifi,
  User,
  Pencil,
  Trash2,
  AlertTriangle,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Server,
  Shield,
  Github,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { AdminGuard } from '@/components/AdminGuard';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomServerManager } from '@/components/BlossomServerManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import {
  getScheduleEventState,
  partitionScheduleEvents,
  scheduleEventNaddr,
  type ScheduleEvent,
} from '@/lib/schedule-event';
import { useEventAuthoring } from '@/hooks/useEventAuthoring';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useAdminMutations } from '@/hooks/useAdminMutations';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import { useEventTemplates, type EventTemplate } from '@/hooks/useEventTemplates';
import type { EventDraft } from '@/lib/event-authoring';
import { SITE_OWNER_PUBKEY } from '@/lib/config';
import { EventForm } from '@/components/EventForm';
import { genUserName } from '@/lib/genUserName';
import { LoginArea } from '@/components/auth/LoginArea';

// ─── Event Manager Tab ──────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function EventRow({
  calEvent,
  onEdit,
  onDeleted,
  currentUserPubkey,
}: {
  calEvent: ScheduleEvent;
  onEdit: (ev: ScheduleEvent) => void;
  onDeleted: () => void;
  currentUserPubkey?: string;
}) {
  const { deleteEvent, isPending: isDeleting } = useEventAuthoring();
  const { toast } = useToast();
  const isPast = getScheduleEventState(calEvent) === 'past';
  const { data: author } = useAuthor(calEvent.event.pubkey);
  const metadata = author?.metadata;
  const authorName = metadata?.name ?? metadata?.display_name ?? genUserName(calEvent.event.pubkey);
  const authorPicture = metadata?.picture;
  const isOwner = currentUserPubkey?.toLowerCase() === calEvent.event.pubkey.toLowerCase();

  const naddr = scheduleEventNaddr(calEvent);

  function handleDelete() {
    deleteEvent(calEvent).then(() => {
      toast({ title: 'Event deleted', description: `"${calEvent.title}" has been deleted.` });
      onDeleted();
    }).catch((error: unknown) => {
      console.error('Failed to delete event:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete this event.',
        variant: 'destructive',
      });
    });
  }

  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
      isPast ? 'border-border bg-card/30 opacity-60' : 'border-border bg-card hover:border-primary/30'
    }`}>
      {/* Date badge */}
      <div className={`flex flex-col items-center justify-center min-w-[56px] rounded-md px-2 py-2 ${
        isPast ? 'bg-muted/30' : 'bg-primary/10'
      }`}>
        <span className={`font-condensed text-xs font-bold uppercase tracking-widest ${
          isPast ? 'text-muted-foreground' : 'text-primary'
        }`}>
          {new Date(calEvent.start * 1000).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </span>
        <span className={`font-condensed text-2xl font-bold leading-none ${
          isPast ? 'text-muted-foreground' : 'text-foreground'
        }`}>
          {new Date(calEvent.start * 1000).getDate()}
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="font-condensed text-base font-bold tracking-wide text-foreground truncate flex-1">
            {calEvent.title}
          </h3>
          {isPast && (
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground border-muted">
              Past
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatDate(calEvent.start)} · {formatTime(calEvent.start)}
            {calEvent.end && ` – ${formatTime(calEvent.end)}`}
          </span>
          {calEvent.location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {calEvent.location}
            </span>
          )}
        </div>
        {/* Author info */}
        <div className="mt-2 flex items-center gap-2">
          <Avatar className="h-5 w-5">
            {authorPicture && <AvatarImage src={authorPicture} alt={authorName} />}
            <AvatarFallback className="text-[10px] bg-muted">
              {authorName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">
            Posted by {authorName}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => onEdit(calEvent)}
            title="Edit event"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground text-xs font-condensed"
          asChild
          title="View event"
        >
          <Link to={`/${naddr}`} target="_blank">
            View
          </Link>
        </Button>

        {isOwner && <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Delete event"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-condensed uppercase tracking-wide">
                Delete Event?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will publish a NIP-09 deletion request for{' '}
                <strong>&ldquo;{calEvent.title}&rdquo;</strong>. Relays may still retain the
                original event; deletion is best-effort on the Nostr network.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-condensed uppercase">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-condensed uppercase"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>}
      </div>
    </div>
  );
}

function EventsTab() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useScheduleEvents();
  const { user } = useCurrentUser();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | undefined>(undefined);
  const [showPast, setShowPast] = useState(false);
  const [templateToLoad, setTemplateToLoad] = useState<EventTemplate | undefined>(undefined);

  const { data: templates = [], isLoading: templatesLoading, saveTemplate, deleteTemplate } = useEventTemplates();

  const partition = events ? partitionScheduleEvents(events) : { upcoming: [], 'in-progress': [], past: [] };
  const upcoming = [...partition['in-progress'], ...partition.upcoming];
  const past = partition.past;

  function handleEdit(ev: ScheduleEvent) {
    setEditingEvent(ev);
    setTemplateToLoad(undefined);
    setShowForm(true);
    window.scrollTo(0, 0);
  }

  function handleFormSuccess() {
    setShowForm(false);
    setEditingEvent(undefined);
    setTemplateToLoad(undefined);
    queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingEvent(undefined);
    setTemplateToLoad(undefined);
  }

  function handleDeleted() {
    queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
  }

  function handleSaveTemplate(name: string, draft: EventDraft) {
    saveTemplate(name, draft);
  }

  function handleLoadTemplate(template: EventTemplate) {
    setTemplateToLoad(template);
    setShowForm(true);
    window.scrollTo(0, 0);
  }

  function handleDeleteTemplate(template: EventTemplate) {
    deleteTemplate(template);
  }

  return (
    <div className="space-y-6">
      {/* Templates section - show when not editing */}
      {!showForm && !templatesLoading && templates.length > 0 && (
        <div>
          <h3 className="font-condensed text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Templates
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((t) => (
              <div
                key={`${t.author}:${t.id}`}
                className="flex items-center gap-2 p-3 rounded-md border border-border bg-muted/20"
              >
                <span className="flex-1 font-condensed text-sm font-bold truncate">{t.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate(t)}
                  className="font-condensed uppercase text-xs"
                >
                  Load
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteTemplate(t)}
                  disabled={t.author !== user?.pubkey}
                  className="size-7 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Separator className="mt-6" />
        </div>
      )}

      {/* Create / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-primary/30 bg-card p-5">
          <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground mb-4 flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-primary" />
            {editingEvent ? 'Edit Event' : templateToLoad ? 'New Event (from template)' : 'New Event'}
          </h2>
          <EventForm
            existing={editingEvent}
            templateToLoad={templateToLoad}
            onSuccess={handleFormSuccess}
            onCancel={handleCancelForm}
            onSaveTemplate={handleSaveTemplate}
          />
        </div>
      ) : (
        <Button
          onClick={() => { setEditingEvent(undefined); setTemplateToLoad(undefined); setShowForm(true); window.scrollTo(0, 0); }}
          className="font-condensed font-bold uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <CalendarPlus className="w-4 h-4 mr-2" />
          Create New Event
        </Button>
      )}

      <Separator />

      {/* Upcoming */}
      <div>
        <h3 className="font-condensed text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Upcoming ({upcoming.length})
        </h3>
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}
        {!isLoading && upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground italic py-4">No upcoming events. Create one above.</p>
        )}
        {!isLoading && upcoming.length > 0 && (
          <div className="space-y-2">
            {upcoming.map((ev) => (
              <EventRow
                key={ev.event.id}
                calEvent={ev}
                onEdit={handleEdit}
                onDeleted={handleDeleted}
                currentUserPubkey={user?.pubkey}
              />
            ))}
          </div>
        )}
      </div>

      {/* Past (collapsible) */}
      {!isLoading && past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast((s) => !s)}
            className="flex items-center gap-2 font-condensed text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPast ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Past Events ({past.length})
          </button>
          {showPast && (
            <div className="mt-3 space-y-2">
              {past.map((ev) => (
                <EventRow
                  key={ev.event.id}
                  calEvent={ev}
                  onEdit={handleEdit}
                  onDeleted={handleDeleted}
                  currentUserPubkey={user?.pubkey}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Relays Tab ─────────────────────────────────────────────────────────────

function RelaysTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground">
          Relay Configuration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage which relays are used for reading and publishing events. Changes are published
          as NIP-65 relay list events when you are logged in.
        </p>
      </div>
      <Separator />
      <RelayListManager />
    </div>
  );
}

// ─── Identity Tab ────────────────────────────────────────────────────────────

function IdentityTab() {
  const { toast } = useToast();
  const [newAdminInput, setNewAdminInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const { user, users, metadata: currentUserMetadata } = useCurrentUser();
  const trustedAdmin = useTrustedAdmin();
  const adminList = trustedAdmin.authority?.trustedAdmins ?? [];
  const adminLoading = !trustedAdmin.authority;
  const { data: adminProfiles } = useAuthors(adminList);
  const { addAdmin, removeAdmin, isSiteOwner } = useAdminMutations();

  const handleAddAdmin = () => {
    const input = newAdminInput.trim();
    if (!input) return;

    let pubkey = input;
    try {
      const decoded = nip19.decode(input);
      if (decoded.type === 'npub') {
        pubkey = decoded.data;
      } else if (decoded.type === 'nprofile') {
        pubkey = decoded.data.pubkey;
      }
    } catch {
      // Assume it's a hex pubkey if decoding fails
    }

    if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      toast({
        title: 'Invalid pubkey',
        description: 'Please enter a valid npub or hex pubkey',
        variant: 'destructive',
      });
      return;
    }

    if (adminList.some(pk => pk.toLowerCase() === pubkey.toLowerCase())) {
      toast({
        title: 'Admin already exists',
        description: 'This pubkey is already an admin',
        variant: 'destructive',
      });
      return;
    }

    addAdmin(pubkey);
    setNewAdminInput('');
    setIsAdding(false);
  };

  const handleRemoveAdmin = (pubkey: string) => {
    removeAdmin(pubkey);
  };

  return (
    <div className="space-y-6">
      {user ? (
        <div className="space-y-3">
          <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Your Identity
          </h2>
          <p className="text-sm text-muted-foreground">
            You are currently logged in with {users.length > 1 ? `${users.length} accounts` : '1 account'}.
          </p>
          <div className="space-y-2">
            {users.map((u, i) => {
              const npub = nip19.npubEncode(u.pubkey);
              const profile = i === 0 ? currentUserMetadata : adminProfiles?.[u.pubkey]?.metadata;
              const displayName = profile?.name ?? profile?.display_name ?? genUserName(u.pubkey);
              const picture = profile?.picture;
              const isCurrent = i === 0;

              return (
                <div
                  key={u.pubkey}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card"
                >
                  <Avatar className="h-10 w-10 border">
                    {picture && <AvatarImage src={picture} alt={displayName} />}
                    <AvatarFallback className="text-xs font-mono bg-muted">
                      {displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-condensed font-bold text-foreground truncate">
                        {displayName}
                      </span>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-xs font-condensed shrink-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground break-all">
                      {npub}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-md border border-dashed bg-muted/10">
          <p className="text-sm text-muted-foreground text-center">
            No account logged in. Log in to access admin features.
          </p>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-primary" />
          Admin Accounts
        </h2>
        <p className="text-sm text-muted-foreground">
          Only the site owner can manage admin access.
        </p>

        {isSiteOwner && isAdding ? (
          <div className="flex gap-2">
            <Input
              placeholder="Enter npub or hex pubkey"
              value={newAdminInput}
              onChange={(e) => setNewAdminInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
              className="font-mono text-sm"
            />
            <Button onClick={handleAddAdmin} size="sm">
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsAdding(false); setNewAdminInput(''); }}
            >
              Cancel
            </Button>
          </div>
        ) : isSiteOwner ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="font-condensed uppercase"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Admin
          </Button>
          ) : null}

        <div className="space-y-2">
          {adminLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/20">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {adminList.map((pk) => {
                let npub = pk;
                try {
                  npub = nip19.npubEncode(pk);
                } catch {
                  // keep as hex if encoding fails
                }
                const isOwner = pk === SITE_OWNER_PUBKEY;
                const profile = adminProfiles?.[pk];
                const displayName = profile?.metadata?.name ?? profile?.metadata?.display_name ?? genUserName(pk);
                const picture = profile?.metadata?.picture;

                return (
                  <div
                    key={pk}
                    className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/20"
                  >
                    <Avatar className="h-10 w-10 border shrink-0">
                      {picture && <AvatarImage src={picture} alt={displayName} />}
                      <AvatarFallback className="text-xs font-mono bg-muted">
                        {displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-condensed font-bold text-foreground truncate">
                          {displayName}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0 font-condensed">
                          {isOwner ? 'Owner' : 'Admin'}
                        </Badge>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground break-all">
                        {npub}
                      </span>
                    </div>
                    {!isOwner && isSiteOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveAdmin(pk)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Blossom Tab ─────────────────────────────────────────────────────────────

function BlossomTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-foreground">
          Blossom Server Configuration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage Blossom servers used for uploading images and files. These servers are used
          when uploading media to events and profiles.
        </p>
      </div>
      <Separator />
      <BlossomServerManager />
    </div>
  );
}

// ─── Admin Page ──────────────────────────────────────────────────────────────

export default function Admin() {
  useSeoMeta({
    title: 'Admin — runngun.org',
    description: 'Manage Run & Gun events, relays, and identity.',
  });

  return (
    <AdminGuard>
      <div className="min-h-screen bg-background font-sans flex flex-col">
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
                    ADMIN
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Manage events, relays and accounts
                  </p>
                </div>
              </div>
              <LoginArea className="max-w-48" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <Tabs defaultValue="events" className="w-full">
          <TabsList className="w-full mb-6 h-auto p-1 bg-muted/30 border border-border rounded-lg grid grid-cols-4">
            <TabsTrigger
              value="events"
              className="font-condensed font-bold uppercase tracking-wide text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5"
            >
              <Calendar className="w-4 h-4 mr-1.5" />
              Events
            </TabsTrigger>
            <TabsTrigger
              value="relays"
              className="font-condensed font-bold uppercase tracking-wide text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5"
            >
              <Wifi className="w-4 h-4 mr-1.5" />
              Relays
            </TabsTrigger>
            <TabsTrigger
              value="blossom"
              className="font-condensed font-bold uppercase tracking-wide text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5"
            >
              <Server className="w-4 h-4 mr-1.5" />
              Blossom
            </TabsTrigger>
            <TabsTrigger
              value="identity"
              className="font-condensed font-bold uppercase tracking-wide text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5"
            >
              <User className="w-4 h-4 mr-1.5" />
              Identity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-0">
            <EventsTab />
          </TabsContent>

          <TabsContent value="relays" className="mt-0">
            <RelaysTab />
          </TabsContent>

          <TabsContent value="blossom" className="mt-0">
            <BlossomTab />
          </TabsContent>

          <TabsContent value="identity" className="mt-0">
            <IdentityTab />
          </TabsContent>
        </Tabs>
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
    </AdminGuard>
  );
}
