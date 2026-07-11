import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface Comment {
  event: NostrEvent;
  pubkey: string;
  content: string;
  createdAt: number;
  rootEventId?: string;
  replyToEventId?: string;
}

function parseComment(event: NostrEvent): Comment {
  const eTags = event.tags.filter(([t]) => t === 'e');
  const replyTo = eTags.length > 1 ? eTags[1]?.[1] : undefined;
  const rootEventId = eTags[0]?.[1];
  
  return {
    event,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    rootEventId,
    replyToEventId: replyTo,
  };
}

export function useEventComments(eventId: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['comments', eventId],
    queryFn: async (c) => {
      const signal = c.signal as AbortSignal;

      const events = await nostr.query(
        [
          {
            kinds: [1],
            '#e': [eventId],
            limit: 100,
          },
        ],
        { signal },
      );

      const comments = events
        .map(parseComment)
        .sort((a, b) => b.createdAt - a.createdAt);

      return buildCommentTree(comments);
    },
    staleTime: 30_000,
  });
}

interface CommentWithReplies extends Comment {
  replies: CommentWithReplies[];
}

function buildCommentTree(comments: Comment[]): CommentWithReplies[] {
  const commentMap = new Map<string, CommentWithReplies>();
  const rootComments: CommentWithReplies[] = [];

  for (const comment of comments) {
    commentMap.set(comment.event.id, { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const commentWithReplies = commentMap.get(comment.event.id)!;
    
    if (comment.replyToEventId && commentMap.has(comment.replyToEventId)) {
      const parent = commentMap.get(comment.replyToEventId)!;
      parent.replies.push(commentWithReplies);
    } else {
      rootComments.push(commentWithReplies);
    }
  }

  return rootComments;
}
