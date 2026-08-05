import type { NostrEvent } from '@nostrify/nostrify';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { decodeScheduleCoordinate, rsvpQueryKeys } from '@/hooks/useEventRSVPs';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';

export interface PublishRSVPParams {
  eventNaddr: string;
  status: 'going' | 'tentative';
}

export function makeRSVPEvent({ eventNaddr, status }: PublishRSVPParams): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  const coordinate = decodeScheduleCoordinate(eventNaddr);
  if (!coordinate) throw new Error('Invalid schedule event coordinate');

  return {
    kind: 31925,
    created_at: Math.floor(Date.now() / 1000),
    content: '',
    tags: [
      ['a', coordinate.value],
      ['d', coordinate.value],
      ['status', status === 'going' ? 'accepted' : 'tentative'],
      ['p', coordinate.pubkey],
    ],
  };
}

export function usePublishRSVP() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PublishRSVPParams) => publishEvent(makeRSVPEvent(params)),
    onSuccess: async (_, { status }) => {
      toast({
        title: status === 'going' ? "You're going!" : 'Marked as maybe',
        description: status === 'going'
          ? 'Your RSVP has been recorded.'
          : 'Your maybe response has been recorded.',
      });
      await queryClient.invalidateQueries({ queryKey: rsvpQueryKeys.all });
    },
    onError: (error) => {
      console.error('Failed to publish RSVP:', error);
      toast({
        title: error instanceof Error && error.message === 'Invalid schedule event coordinate'
          ? 'Invalid event'
          : 'Failed to RSVP',
        description: 'There was an error recording your response.',
        variant: 'destructive',
      });
    },
  });
}
