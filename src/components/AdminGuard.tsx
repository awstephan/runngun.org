import { type ReactNode } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';
import { LoginArea } from '@/components/auth/LoginArea';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * AdminGuard — wraps admin-only content behind Nostr authentication.
 *
 * Shows a login prompt if not logged in, and an "unauthorized" message
 * if the logged-in pubkey is not in the admin list (stored on Nostr).
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { user } = useCurrentUser();
  const trustedAdmin = useTrustedAdmin();
  const access = trustedAdmin.accessFor(user?.pubkey);

  // Loading admin list
  if (!trustedAdmin.authority) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <Skeleton className="w-16 h-16 rounded-full mx-auto" />
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-primary/40 bg-primary/10 mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>

          <div>
            <h1 className="font-condensed text-3xl font-bold uppercase tracking-wide text-foreground">
              Admin Access
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with your Nostr identity to manage Run &amp; Gun events.
            </p>
          </div>

          <div className="flex justify-center">
            <LoginArea className="w-full" />
          </div>

          <p className="text-xs text-muted-foreground">
            Access is restricted to authorized admin accounts only.
          </p>
        </div>
      </div>
    );
  }

  // Logged in but not an admin
  if (access.status !== 'trusted-admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-destructive/40 bg-destructive/10 mx-auto">
            <ShieldOff className="w-8 h-8 text-destructive" />
          </div>

          <div>
            <h1 className="font-condensed text-3xl font-bold uppercase tracking-wide text-foreground">
              Access Denied
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Nostr account is not authorized to access the admin panel.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60 font-mono break-all">
              {user.pubkey}
            </p>
          </div>

          <div className="flex justify-center">
            <LoginArea className="w-full" />
          </div>

          <p className="text-xs text-muted-foreground">
            Contact the site owner to request admin access.
          </p>
        </div>
      </div>
    );
  }

  // Authorized — render children
  return <>{children}</>;
}
