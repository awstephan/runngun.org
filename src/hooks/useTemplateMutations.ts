import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { TEMPLATES_DTAG } from '@/lib/config';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { EventTemplate } from './useTemplateList';

export function useTemplateMutations(adminPubkeys: string[]) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user ? adminPubkeys.some(pk => pk.toLowerCase() === user.pubkey.toLowerCase()) : false;

  const saveTemplate = async (template: EventTemplate) => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'You must be logged in to save templates', variant: 'destructive' });
      return;
    }

    if (!isAdmin) {
      toast({ title: 'Not authorized', description: 'Only admins can save templates', variant: 'destructive' });
      return;
    }

    try {
      const events = await nostr.query([
        { kinds: [30078], authors: adminPubkeys, '#d': [TEMPLATES_DTAG], limit: 1 },
      ]);

      let existingTemplates: EventTemplate[] = [];
      if (events.length > 0) {
        try {
          const parsed = JSON.parse(events[0].content);
          if (Array.isArray(parsed)) {
            existingTemplates = parsed;
          }
        } catch {
          // ignore parse errors
        }
      }

      const updatedTemplates = existingTemplates.some(t => t.id === template.id)
        ? existingTemplates.map(t => t.id === template.id ? template : t)
        : [...existingTemplates, template];

      const signed = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(updatedTemplates),
        tags: [
          ['d', TEMPLATES_DTAG],
          ['alt', 'runngun.org event templates'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10000) });
      queryClient.invalidateQueries({ queryKey: ['template-list'] });

      toast({ title: 'Template saved', description: `"${template.name}" has been saved.` });
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({ title: 'Failed to save template', variant: 'destructive' });
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'You must be logged in to delete templates', variant: 'destructive' });
      return;
    }

    if (!isAdmin) {
      toast({ title: 'Not authorized', description: 'Only admins can delete templates', variant: 'destructive' });
      return;
    }

    try {
      const events = await nostr.query([
        { kinds: [30078], authors: adminPubkeys, '#d': [TEMPLATES_DTAG], limit: 1 },
      ]);

      if (events.length === 0) {
        toast({ title: 'Template not found', variant: 'destructive' });
        return;
      }

      let existingTemplates: EventTemplate[] = [];
      try {
        const parsed = JSON.parse(events[0].content);
        if (Array.isArray(parsed)) {
          existingTemplates = parsed;
        }
      } catch {
        toast({ title: 'No templates found', variant: 'destructive' });
        return;
      }

      const updatedTemplates = existingTemplates.filter(t => t.id !== templateId);

      const signed = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(updatedTemplates),
        tags: [
          ['d', TEMPLATES_DTAG],
          ['alt', 'runngun.org event templates'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10000) });
      queryClient.invalidateQueries({ queryKey: ['template-list'] });

      toast({ title: 'Template deleted' });
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({ title: 'Failed to delete template', variant: 'destructive' });
    }
  };

  return { saveTemplate, deleteTemplate, isAdmin };
}
