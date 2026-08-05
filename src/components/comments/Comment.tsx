import { useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import type { CommentNode, CommentRoot } from '@/hooks/useComments';
import { CommentForm } from './CommentForm';
import { NoteContent } from '@/components/NoteContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MessageSquare, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { genUserName } from '@/lib/genUserName';

interface CommentProps {
  root: CommentRoot;
  node: CommentNode;
  depth?: number;
}

const MAX_RENDER_DEPTH = 6;

export function Comment({ root, node, depth = 0 }: CommentProps) {
  const comment = node.event;
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2); // Auto-expand first 2 levels
  
  const author = useAuthor(comment.pubkey);
  
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(comment.pubkey)
  const timeAgo = formatDistanceToNow(new Date(comment.created_at * 1000), { addSuffix: true });

  const replies = node.replies;
  const hasReplies = replies.length > 0;
  const atDepthLimit = depth >= MAX_RENDER_DEPTH - 1;

  return (
    <div className={`space-y-3 ${depth > 0 ? 'ml-6 border-l-2 border-muted pl-4' : ''}`}>
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Comment Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <Link to={`/${nip19.npubEncode(comment.pubkey)}`}>
                  <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
                    <AvatarImage src={metadata?.picture} />
                    <AvatarFallback className="text-xs">
                      {displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div>
                  <Link 
                    to={`/${nip19.npubEncode(comment.pubkey)}`}
                    className="font-medium text-sm hover:text-primary transition-colors"
                  >
                    {displayName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{timeAgo}</p>
                </div>
              </div>
            </div>

            {/* Comment Content */}
            <div className="text-sm">
              <NoteContent event={comment} className="text-sm" />
            </div>

            {/* Comment Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                {!atDepthLimit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReplyForm(!showReplyForm)}
                    className="h-8 px-2 text-xs"
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Reply
                  </Button>
                )}
                
                {hasReplies && (
                  <Collapsible open={showReplies} onOpenChange={setShowReplies}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                        {showReplies ? (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        ) : (
                          <ChevronRight className="h-3 w-3 mr-1" />
                        )}
                        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                )}
              </div>

              {/* Comment menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Comment options"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reply Form */}
      {showReplyForm && !atDepthLimit && (
        <div className="ml-6">
          <CommentForm
            root={root}
            reply={comment}
            onSuccess={() => setShowReplyForm(false)}
            placeholder="Write a reply..."
            compact
          />
        </div>
      )}

      {/* Replies */}
      {hasReplies && !atDepthLimit && (
        <Collapsible open={showReplies} onOpenChange={setShowReplies}>
          <CollapsibleContent className="space-y-3">
            {replies.map((reply) => (
              <Comment
                key={reply.event.id}
                root={root}
                node={reply}
                depth={depth + 1}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {hasReplies && atDepthLimit && (
        <p className="ml-6 text-xs text-muted-foreground">
          Additional replies are hidden to keep this thread readable.
        </p>
      )}
    </div>
  );
}
