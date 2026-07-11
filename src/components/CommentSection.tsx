import { useState } from 'react';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useEventComments } from '@/hooks/useEventComments';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Comment } from '@/hooks/useEventComments';

interface CommentSectionProps {
  eventId: string;
  authorPubkey: string;
}

export function CommentSection({ eventId, authorPubkey }: CommentSectionProps) {
  const { data: comments, isLoading } = useEventComments(eventId);

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading comments...</div>;
  }

  const isEmpty = !comments || comments.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-8">
        <MessageCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Be the first to comment!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentThread
          key={comment.event.id}
          comment={comment}
          eventId={eventId}
          authorPubkey={authorPubkey}
        />
      ))}
    </div>
  );
}

interface CommentThreadProps {
  comment: Comment & { replies: (Comment & { replies: Comment[] })[] };
  eventId: string;
  authorPubkey: string;
}

function CommentThread({ comment, eventId, authorPubkey }: CommentThreadProps) {
  const [showReplies, setShowReplies] = useState(false);
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className="space-y-2">
      <CommentItem comment={comment} eventId={eventId} authorPubkey={authorPubkey} />
      
      {hasReplies && (
        <div className="ml-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReplies(!showReplies)}
            className="text-xs text-muted-foreground"
          >
            {showReplies ? (
              <ChevronUp className="w-3 h-3 mr-1" />
            ) : (
              <ChevronDown className="w-3 h-3 mr-1" />
            )}
            {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </Button>
          
          {showReplies && (
            <div className="space-y-2 mt-2">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.event.id}
                  comment={reply}
                  eventId={eventId}
                  authorPubkey={authorPubkey}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: Comment;
  eventId: string;
  authorPubkey: string;
}

function CommentItem({ comment }: CommentItemProps) {
  const { data: author } = useAuthor(comment.pubkey);
  const name = author?.metadata?.name ?? genUserName(comment.pubkey);
  const picture = author?.metadata?.picture;

  const timeAgo = formatTimeAgo(comment.createdAt);

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={picture} />
        <AvatarFallback className="text-xs">
          {name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp * 1000).toLocaleDateString();
}
