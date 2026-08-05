import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { commentRootIdentity, commentRootKey, type CommentRoot } from '@/hooks/useComments';

interface PostCommentParams {
  root: CommentRoot;
  reply?: CommentRoot;
  content: string;
}

/** Post a NIP-22 (kind 1111) comment on an event. */
export function usePostComment() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content }: PostCommentParams) => {
      const tags = makeCommentTags(root, reply);

      const event = await publishEvent({
        kind: 1111,
        content,
        tags,
      });

      return event;
    },
    onSuccess: (_, { root }) => {
      queryClient.invalidateQueries({
        queryKey: ['nostr', 'comments', commentRootKey(root)]
      });
    },
  });
}

/** Build the complete NIP-22 root and parent identity tags. */
export function makeCommentTags(root: CommentRoot, reply?: CommentRoot): string[][] {
  return [...makeTargetTags(root, true), ...makeTargetTags(reply ?? root, false)];
}

function makeTargetTags(target: CommentRoot, rootScope: boolean): string[][] {
  const identity = commentRootIdentity(target);
  if (!identity) throw new Error('Comment target is invalid');
  const referenceTag = rootScope ? identity.referenceTag : identity.referenceTag.toLowerCase();
  const tags: string[][] = [[referenceTag, identity.reference]];
  if (!rootScope && identity.addressable && identity.eventId) tags.push(['e', identity.eventId]);
  tags.push([rootScope ? 'K' : 'k', identity.kind]);
  if (identity.pubkey) tags.push([rootScope ? 'P' : 'p', identity.pubkey]);
  return tags;
}
