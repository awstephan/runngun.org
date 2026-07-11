import { useState, useEffect, useRef } from 'react';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { InvalidEventDraftError, useEventAuthoring } from '@/hooks/useEventAuthoring';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, X, Save, Upload, Calendar } from 'lucide-react';
import type { ScheduleEvent } from '@/lib/schedule-event';
import {
  createEventDraft,
  draftFromScheduleEvent,
  draftFromTemplate,
  type EventDraft,
  type EventTemplateFields,
} from '@/lib/event-authoring';

const US_TIMEZONES = [
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
];

interface EventFormProps {
  existing?: ScheduleEvent;
  templateToLoad?: EventTemplateFields;
  onSuccess?: () => void;
  onCancel?: () => void;
  onSaveTemplate?: (name: string, draft: EventDraft) => void;
}

export function EventForm({ existing, templateToLoad, onSuccess, onCancel, onSaveTemplate }: EventFormProps) {
  const { publishDraft, isPending } = useEventAuthoring();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultTz = US_TIMEZONES.some(tz => tz.value === browserTz) ? browserTz : 'America/Chicago';

  const [form, setForm] = useState<EventDraft>(() => createEventDraft(defaultTz));

  useEffect(() => {
    if (!existing) return;
    setForm(draftFromScheduleEvent(existing));
  }, [existing]);

  useEffect(() => {
    if (!templateToLoad) return;
    setForm(draftFromTemplate(templateToLoad, defaultTz));
  }, [defaultTz, templateToLoad]);

  function setField<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleStartDateChange(value: string) {
    setForm((prev) => ({ ...prev, startDate: value }));

    // Auto-set end date to next day at 5pm if start date is Sat/Sun
    const date = new Date(value + 'T00:00:00');
    const day = date.getDay();
    if (day === 0 || day === 6) { // Sunday (0) or Saturday (6)
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const y = nextDay.getFullYear();
      const m = String(nextDay.getMonth() + 1).padStart(2, '0');
      const d = String(nextDay.getDate()).padStart(2, '0');
      setForm((prev) => ({
        ...prev,
        endDate: `${y}-${m}-${d}`,
        endTime: '17:00',
      }));
    }
  }

  function setLink(index: number, value: string) {
    const updated = [...form.links];
    updated[index] = value;
    setForm((prev) => ({ ...prev, links: updated }));
  }

  function addLink() {
    setForm((prev) => ({ ...prev, links: [...prev.links, ''] }));
  }

  function removeLink(index: number) {
    const updated = form.links.filter((_, i) => i !== index);
    setForm((prev) => ({ ...prev, links: updated.length > 0 ? updated : [''] }));
  }

  async function handleImageUpload(file: File) {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to upload images.',
        variant: 'destructive',
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Image must be under 10MB.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const urlTag = tags.find((t: string[]) => t[0] === 'url');
      if (urlTag && urlTag[1]) {
        setField('image', urlTag[1]);
        toast({ title: 'Image uploaded', description: 'Image has been uploaded successfully.' });
      }
    } catch (err) {
      console.error('Upload failed:', err);
      toast({
        title: 'Upload failed',
        description: 'There was an error uploading the image.',
        variant: 'destructive',
      });
    }
  }

  function handleSaveTemplate() {
    const name = prompt('Enter template name:');
    if (name?.trim()) {
      onSaveTemplate?.(name.trim(), form);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await publishDraft(form, existing);
      toast({
        title: existing ? 'Event updated' : 'Event published',
        description: `"${form.title}" has been ${existing ? 'updated' : 'published'} to Nostr.`,
      });
      onSuccess?.();
    } catch (error) {
      console.error('Failed to publish event:', error);
      toast({
        title: error instanceof InvalidEventDraftError ? error.message : 'Failed to publish event',
        description: error instanceof InvalidEventDraftError
          ? undefined
          : 'There was an error publishing this event to Nostr.',
        variant: 'destructive',
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Title <span className="text-primary">*</span>
        </Label>
        <Input
          id="ev-title"
          placeholder="e.g., Spring Run & Gun Open 2025"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-summary" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Short Summary
        </Label>
        <Input
          id="ev-summary"
          placeholder="One-line description shown in the event list"
          value={form.summary}
          onChange={(e) => setField('summary', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-start-date" className="font-condensed font-600 uppercase text-xs tracking-wide">
            Start Date <span className="text-primary">*</span>
          </Label>
          <div className="relative">
            <Input
              id="ev-start-date"
              type="date"
              value={form.startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="pl-10"
              required
            />
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-start-time" className="font-condensed font-600 uppercase text-xs tracking-wide">
            Start Time <span className="text-primary">*</span>
          </Label>
          <Input
            id="ev-start-time"
            type="time"
            value={form.startTime}
            onChange={(e) => setField('startTime', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-end-date" className="font-condensed font-600 uppercase text-xs tracking-wide">
            End Date
          </Label>
          <div className="relative">
            <Input
              id="ev-end-date"
              type="date"
              value={form.endDate}
              onChange={(e) => setField('endDate', e.target.value)}
              className="pl-10"
            />
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-end-time" className="font-condensed font-600 uppercase text-xs tracking-wide">
            End Time
          </Label>
          <Input
            id="ev-end-time"
            type="time"
            value={form.endTime}
            onChange={(e) => setField('endTime', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-tzid" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Timezone
        </Label>
        <Select value={form.tzid} onValueChange={(value) => setField('tzid', value)}>
          <SelectTrigger id="ev-tzid">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {US_TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-location" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Location
        </Label>
        <Input
          id="ev-location"
          placeholder="e.g., Broken Spur Ranch, Burnet TX"
          value={form.location}
          onChange={(e) => setField('location', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-price" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Price
        </Label>
        <Input
          id="ev-price"
          placeholder="e.g., $20, Free, Pay what you can"
          value={form.price}
          onChange={(e) => setField('price', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className="font-condensed font-600 uppercase text-xs tracking-wide">
          Banner Image
        </Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id="ev-image"
              type="url"
              placeholder="Or enter image URL..."
              value={form.image}
              onChange={(e) => setField('image', e.target.value)}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !user}
            className="shrink-0"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload
          </Button>
        </div>
        {form.image && (
          <div className="relative mt-2 rounded-md overflow-hidden border bg-muted/30">
            <img
              src={form.image}
              alt="Banner preview"
              className="w-full h-32 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 bg-background/80 hover:bg-background text-muted-foreground hover:text-destructive"
              onClick={() => setField('image', '')}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {!user && (
          <p className="text-xs text-muted-foreground">Log in to upload images</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-content" className="font-condensed font-600 uppercase text-xs tracking-wide">
          Full Description
        </Label>
        <Textarea
          id="ev-content"
          rows={5}
          placeholder="Detailed event description, rules, schedule, etc."
          value={form.content}
          onChange={(e) => setField('content', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className="font-condensed font-600 uppercase text-xs tracking-wide">
          Links (registration, info, etc.)
        </Label>
        {form.links.map((link, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="url"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(i, e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLink(i)}
              className="text-muted-foreground hover:text-destructive shrink-0"
              disabled={form.links.length === 1}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          className="text-xs font-condensed uppercase tracking-wide"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Link
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="font-condensed font-bold uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {existing ? 'Update Event' : 'Publish Event'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="font-condensed font-bold uppercase tracking-wide"
          >
            Cancel
          </Button>
        )}
        {onSaveTemplate && (
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveTemplate}
            className="font-condensed font-bold uppercase tracking-wide"
          >
            <Save className="w-4 h-4 mr-2" />
            Save as Template
          </Button>
        )}
      </div>
    </form>
  );
}
