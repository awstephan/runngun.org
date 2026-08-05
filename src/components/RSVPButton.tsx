import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, HelpCircle } from 'lucide-react';

interface RSVPButtonProps {
  eventNaddr: string;
}

export function RSVPButton({ eventNaddr }: RSVPButtonProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishRSVP, isPending } = usePublishRSVP();
  const { data, isLoading } = useEventRSVPs(eventNaddr);

  if (!user) {
    return (
      <div className="text-sm text-muted-foreground">
        Log in to RSVP
      </div>
    );
  }

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin" />;
  }

  const currentStatus = data?.currentUserStatus;

  const handleGoing = () => {
    void publishRSVP({ eventNaddr, status: 'going' });
  };

  const handleTentative = () => {
    void publishRSVP({ eventNaddr, status: 'tentative' });
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={currentStatus === 'going' ? 'default' : 'outline'}
        onClick={handleGoing}
        disabled={isPending}
        className="font-condensed font-bold uppercase tracking-wide"
      >
        {currentStatus === 'going' && <CheckCircle className="w-4 h-4 mr-1.5" />}
        Going
      </Button>
      <Button
        size="sm"
        variant={currentStatus === 'tentative' ? 'default' : 'outline'}
        onClick={handleTentative}
        disabled={isPending}
        className="font-condensed font-bold uppercase tracking-wide"
      >
        {currentStatus === 'tentative' && <HelpCircle className="w-4 h-4 mr-1.5" />}
Maybe
      </Button>
    </div>
  );
}
