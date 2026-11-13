import type { NostrEvent } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools';
import type { EventDraft } from '@/lib/event-authoring';

export const EVENT_DRAFT_KIND = 3523;
export const EVENT_DRAFT_TOPIC = 'runngun-event-draft';

export interface SharedEventDraft {
  id: string;
  creator: string;
  event: NostrEvent;
  fields: EventDraft;
}

const FIELD_TAGS = {
  title: 'title', summary: 'summary', location: 'location', image: 'image', price: 'price',
  startDate: 'start_date', startTime: 'start_time', endDate: 'end_date', endTime: 'end_time', tzid: 'start_tzid',
} as const;

export function draftCreationEvent(fields: EventDraft): Pick<NostrEvent, 'kind' | 'content' | 'tags'> {
  if (!fields.title.trim()) throw new Error('Title is required');
  return {
    kind: EVENT_DRAFT_KIND,
    content: fields.content,
    tags: [
      ['t', EVENT_DRAFT_TOPIC], ['version', '1'], ['op', 'create'],
      ['d', crypto.randomUUID()],
      ['alt', 'Public Run & Gun Event Draft'],
      ...Object.entries(FIELD_TAGS).map(([field, tag]) => [tag, fields[field as keyof typeof FIELD_TAGS]]),
      ...fields.links.map((link) => ['r', link]),
    ],
  };
}

export function readSharedEventDrafts(events: NostrEvent[], trustedAdmins: readonly string[]): SharedEventDraft[] {
  const trusted = new Set(trustedAdmins);
  const seen = new Set<string>();
  const records = events.filter((event) => {
    if (seen.has(event.id) || !trusted.has(event.pubkey) || event.kind !== EVENT_DRAFT_KIND) return false;
    const single = (name: string) => event.tags.filter(([tag]) => tag === name);
    if (!event.tags.some(([tag, value]) => tag === 't' && value === EVENT_DRAFT_TOPIC) ||
      single('version').length !== 1 || single('version')[0][1] !== '1' ||
      single('op').length !== 1 || !['create', 'revise', 'delete'].includes(single('op')[0][1]) ||
      Object.values(FIELD_TAGS).some((tag) => single(tag).length > 1) ||
      event.tags.some((tag) => tag.length < 2)) return false;
    const operation = single('op')[0][1];
    if (operation !== 'delete' && (single('title').length !== 1 || !single('title')[0][1]?.trim())) return false;
    const references = single('e');
    const markers = operation === 'delete' ? ['root'] : ['root', 'previous'];
    if (operation === 'create' ? references.length !== 0 : (
      references.length !== markers.length ||
      markers.some((marker) => references.filter((tag) => tag[3] === marker && /^[0-9a-f]{64}$/.test(tag[1])).length !== 1)
    )) return false;
    try {
      // Explicit fields avoid relying on nostr-tools' cached verification symbol.
      const { id, pubkey, sig, kind, content, tags, created_at } = event;
      if (!verifyEvent({ id, pubkey, sig, kind, content, tags, created_at })) return false;
    } catch {
      return false;
    }
    seen.add(event.id);
    return true;
  });
  const deleted = new Set(records.filter((event) => event.tags.some(([tag, value]) => tag === 'op' && value === 'delete'))
    .map((event) => event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root')![1]));
  const roots = records.filter((event) => !deleted.has(event.id) && event.tags.some(([tag, value]) => tag === 'op' && value === 'create'));
  return roots.map((root) => {
    const event = [root, ...records.filter((record) => record.tags.some((tag) => tag[0] === 'e' && tag[1] === root.id && tag[3] === 'root'))]
      .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
    const value = (name: string) => event.tags.find(([tag]) => tag === name)?.[1] ?? '';
    return {
      id: root.id, creator: root.pubkey, event,
      fields: {
        title: value('title'), summary: value('summary'), content: event.content,
        location: value('location'), image: value('image'), price: value('price'),
        startDate: value('start_date'), startTime: value('start_time'),
        endDate: value('end_date'), endTime: value('end_time'), tzid: value('start_tzid'),
        links: event.tags.filter(([tag]) => tag === 'r').map((tag) => tag[1]),
      },
    };
  }).sort((a, b) => b.event.created_at - a.event.created_at || a.event.id.localeCompare(b.event.id));
}

export function draftRevisionEvent(fields: EventDraft, base: SharedEventDraft): Pick<NostrEvent, 'kind' | 'content' | 'tags' | 'created_at'> {
  const snapshot = draftCreationEvent(fields);
  return {
    ...snapshot,
    created_at: Math.max(Math.floor(Date.now() / 1000), base.event.created_at + 1),
    tags: [...snapshot.tags.filter(([tag]) => tag !== 'op' && tag !== 'd'),
      ['op', 'revise'], ['e', base.id, '', 'root'], ['e', base.event.id, '', 'previous']],
  };
}

export class StaleEventDraftError extends Error {
  constructor(public readonly latest: SharedEventDraft) {
    super('This draft has changed. Load the latest draft and reconcile your unsaved fields before saving.');
  }
}
