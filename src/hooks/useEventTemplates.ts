import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { TEMPLATES_DTAG } from '@/lib/config';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import {
  templateFieldsFromDraft,
  type EventDraft,
  type EventTemplateFields,
} from '@/lib/event-authoring';

export interface EventTemplate extends EventTemplateFields {
  id: string;
  name: string;
  author: string;
}

function parseTemplate(value: unknown, author: string): EventTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const template = value as Partial<EventTemplate>;
  if (typeof template.id !== 'string' || typeof template.name !== 'string') return null;
  const links = Array.isArray(template.links)
    ? template.links.filter((link): link is string => typeof link === 'string')
    : [];
  return {
    id: template.id,
    name: template.name,
    author,
    title: typeof template.title === 'string' ? template.title : '',
    summary: typeof template.summary === 'string' ? template.summary : '',
    content: typeof template.content === 'string' ? template.content : '',
    location: typeof template.location === 'string' ? template.location : '',
    image: typeof template.image === 'string' ? template.image : '',
    price: typeof template.price === 'string' ? template.price : '',
    links,
  };
}

function parseTemplateDocument(event: NostrEvent): EventTemplate[] | null {
  try {
    const value: unknown = JSON.parse(event.content);
    if (!Array.isArray(value)) return null;
    const templates = value.map((item) => parseTemplate(item, event.pubkey));
    return templates.every((template) => template !== null)
      ? templates as EventTemplate[]
      : null;
  } catch {
    return null;
  }
}

export function useEventTemplates() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;
  const isTrustedAdmin = trustedAdmin.accessFor(user?.pubkey).status === 'trusted-admin';

  const query = useQuery({
    queryKey: ['event-templates', authority?.revision],
    queryFn: async ({ signal }) => {
      const events = await trustedAdmin.queryTrusted(
        [{
          kinds: [30078],
          '#d': [TEMPLATES_DTAG],
          limit: authority?.trustedAdmins.length ?? 1,
        }],
        { signal },
      );
      const latestByAuthor = new Map<string, NostrEvent>();
      for (const event of events) {
        const current = latestByAuthor.get(event.pubkey);
        if (!current || event.created_at > current.created_at ||
          (event.created_at === current.created_at && event.id > current.id)) {
          latestByAuthor.set(event.pubkey, event);
        }
      }
      return [...latestByAuthor.values()]
        .flatMap((event) => parseTemplateDocument(event) ?? [])
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: Boolean(authority),
    staleTime: 30_000,
  });

  const readOwnTemplates = async (): Promise<EventTemplate[]> => {
    if (!user) throw new Error('Not logged in');
    const events = await nostr.query([{
      kinds: [30078],
      authors: [user.pubkey],
      '#d': [TEMPLATES_DTAG],
      limit: 1,
    }]);
    if (!events[0]) return [];
    const templates = parseTemplateDocument(events[0]);
    if (!templates) throw new Error('Current template document is invalid');
    return templates;
  };

  const publishOwnTemplates = async (templates: EventTemplate[]): Promise<void> => {
    if (!user) throw new Error('Not logged in');
    const content = templates.map(({ author: _author, ...template }) => template);
    const signed = await user.signer.signEvent({
      kind: 30078,
      content: JSON.stringify(content),
      tags: [
        ['d', TEMPLATES_DTAG],
        ['alt', 'runngun.org event templates'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    await nostr.event(signed, { signal: AbortSignal.timeout(10_000) });
    await queryClient.invalidateQueries({ queryKey: ['event-templates'] });
  };

  const saveTemplate = async (name: string, draft: EventDraft): Promise<void> => {
    if (!user || !isTrustedAdmin) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    try {
      const templates = await readOwnTemplates();
      const template: EventTemplate = {
        id: crypto.randomUUID(),
        name: name.trim(),
        author: user.pubkey,
        ...templateFieldsFromDraft(draft),
      };
      await publishOwnTemplates([...templates, template]);
      toast({ title: 'Template saved', description: `"${template.name}" has been saved.` });
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({ title: 'Failed to save template', variant: 'destructive' });
    }
  };

  const deleteTemplate = async (template: EventTemplate): Promise<void> => {
    if (!user || !isTrustedAdmin || template.author !== user.pubkey) {
      toast({ title: 'Only the template owner can delete it', variant: 'destructive' });
      return;
    }
    try {
      const templates = await readOwnTemplates();
      await publishOwnTemplates(templates.filter((item) => item.id !== template.id));
      toast({ title: 'Template deleted' });
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({ title: 'Failed to delete template', variant: 'destructive' });
    }
  };

  return { ...query, saveTemplate, deleteTemplate, isTrustedAdmin };
}
