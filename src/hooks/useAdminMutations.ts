import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SITE_OWNER_PUBKEY, ADMIN_LIST_DTAG } from '@/lib/config';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  AUTHORITY_QUERY_KEY,
  normalizePubkey,
  parseAuthorityEvent,
  persistAuthority,
  useTrustedAdmin,
} from '@/hooks/useTrustedAdmin';

export function useAdminMutations() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const trustedAdmin = useTrustedAdmin();

  const isSiteOwner = user?.pubkey === SITE_OWNER_PUBKEY;

  const addAdmin = async (pubkey: string) => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to add admins',
        variant: 'destructive',
      });
      return;
    }

    if (!isSiteOwner) {
      toast({
        title: 'Permission denied',
        description: 'Only the site owner can add admins',
        variant: 'destructive',
      });
      return;
    }

    try {
      const refreshed = await trustedAdmin.refetch();
      const authority = refreshed.data;
      if (!authority || authority.freshness !== 'fresh') {
        toast({
          title: 'Admin list is stale',
          description: 'Reconnect to Nostr before changing admin access',
          variant: 'destructive',
        });
        return;
      }

      const normalizedPubkey = normalizePubkey(pubkey);
      if (!normalizedPubkey) throw new Error('Invalid pubkey');

      if (authority.trustedAdmins.includes(normalizedPubkey)) {
        toast({
          title: 'Admin already exists',
          description: 'This pubkey is already an admin',
          variant: 'destructive',
        });
        return;
      }

      const newPubkeys = [...authority.trustedAdmins, normalizedPubkey]
        .filter((pk) => pk !== SITE_OWNER_PUBKEY);

      const event = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(newPubkeys),
        tags: [
          ['d', ADMIN_LIST_DTAG],
          ['alt', 'runngun.org admin list'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(10000) });
      const nextAuthority = parseAuthorityEvent(event);
      if (!nextAuthority) throw new Error('Published an invalid admin document');
      persistAuthority(nextAuthority);
      queryClient.setQueryData(AUTHORITY_QUERY_KEY, nextAuthority);

      toast({
        title: 'Admin added',
        description: 'New admin has been added successfully',
      });
    } catch (error) {
      console.error('Failed to add admin:', error);
      toast({
        title: 'Failed to add admin',
        description: 'Could not publish admin list to Nostr',
        variant: 'destructive',
      });
    }
  };

  const removeAdmin = async (pubkey: string) => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to remove admins',
        variant: 'destructive',
      });
      return;
    }

    if (!isSiteOwner) {
      toast({
        title: 'Permission denied',
        description: 'Only the site owner can remove admins',
        variant: 'destructive',
      });
      return;
    }

    try {
      const refreshed = await trustedAdmin.refetch();
      const authority = refreshed.data;
      if (!authority || authority.freshness !== 'fresh') {
        toast({
          title: 'Admin list is stale',
          description: 'Reconnect to Nostr before changing admin access',
          variant: 'destructive',
        });
        return;
      }

      const normalizedPubkey = normalizePubkey(pubkey);
      if (!normalizedPubkey) throw new Error('Invalid pubkey');

      if (!authority.trustedAdmins.includes(normalizedPubkey)) {
        toast({
          title: 'Admin not found',
          description: 'This pubkey is not in the admin list',
          variant: 'destructive',
        });
        return;
      }

      if (normalizedPubkey === SITE_OWNER_PUBKEY) {
        toast({
          title: 'Cannot remove site owner',
          variant: 'destructive',
        });
        return;
      }

      const newPubkeys = authority.trustedAdmins.filter(
        (pk) => pk !== normalizedPubkey && pk !== SITE_OWNER_PUBKEY,
      );

      const event = await user.signer.signEvent({
        kind: 30078,
        content: JSON.stringify(newPubkeys),
        tags: [
          ['d', ADMIN_LIST_DTAG],
          ['alt', 'runngun.org admin list'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(10000) });
      const nextAuthority = parseAuthorityEvent(event);
      if (!nextAuthority) throw new Error('Published an invalid admin document');
      persistAuthority(nextAuthority);
      queryClient.setQueryData(AUTHORITY_QUERY_KEY, nextAuthority);

      toast({
        title: 'Admin removed',
        description: 'Admin has been removed successfully',
      });
    } catch (error) {
      console.error('Failed to remove admin:', error);
      toast({
        title: 'Failed to remove admin',
        description: 'Could not publish admin list to Nostr',
        variant: 'destructive',
      });
    }
  };

  return { addAdmin, removeAdmin, isSiteOwner };
}
