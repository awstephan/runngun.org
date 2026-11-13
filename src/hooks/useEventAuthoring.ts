import { useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocationCuration } from '@/hooks/useLocationCuration';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  deletionRequestFor,
  eventFromDraft,
  type EventDraft,
} from '@/lib/event-authoring';
import type { ScheduleEvent } from '@/lib/schedule-event';

export class InvalidEventDraftError extends Error {}

export function useEventAuthoring() {
  const publication = useNostrPublish();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { curateLocation } = useLocationCuration();

  const publishDraft = async (
    draft: EventDraft,
    existing?: ScheduleEvent,
  ): Promise<void> => {
    const result = eventFromDraft(draft, existing?.d ?? crypto.randomUUID());
    if (!result.ok) throw new InvalidEventDraftError(result.message);

    // Keep shared-draft provenance on addressable replacements as well as initial publication.
    if (existing) {
      result.event.tags.push(...existing.event.tags.filter((tag) => tag[0] === 'e' && tag[3] === 'root'));
    }
    await publication.mutateAsync(result.event);
    await queryClient.invalidateQueries({ queryKey: ['schedule-events'] });

    if (draft.location.trim()) {
      void curateLocation(draft.location.trim());
    }
  };

  const deleteEvent = async (event: ScheduleEvent): Promise<void> => {
    if (!user || user.pubkey.toLowerCase() !== event.event.pubkey.toLowerCase()) {
      throw new Error('Only the Schedule Event author can delete it');
    }
    await publication.mutateAsync(deletionRequestFor(event));
    await queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
  };

  return {
    publishDraft,
    deleteEvent,
    isPending: publication.isPending,
  };
}
