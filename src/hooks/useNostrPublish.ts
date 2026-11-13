import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";

import type { NostrEvent } from "@nostrify/nostrify";

interface PublishOptions {
  /** Retain the signed event before transmission so an uncertain write can be retried. */
  onSigned?: (event: NostrEvent) => void;
}

export function useNostrPublish(options: PublishOptions = {}): UseMutationResult<NostrEvent> & {
  republish: (event: NostrEvent) => Promise<void>;
} {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const republish = async (event: NostrEvent): Promise<void> => {
    if (!user || event.pubkey !== user.pubkey) throw new Error('Only the signing account can retry this publication');
    await nostr.event(event, { signal: AbortSignal.timeout(5000) });
  };

  const mutation = useMutation({
    mutationFn: async (t: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>) => {
      if (user) {
        const tags = t.tags ?? [];

        // Add the client tag if it doesn't exist
        if (location.protocol === "https:" && !tags.some(([name]) => name === "client")) {
          tags.push(["client", location.hostname]);
        }

        const event = await user.signer.signEvent({
          kind: t.kind,
          content: t.content ?? "",
          tags,
          created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        });

        options.onSigned?.(event);
        await republish(event);
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
  return { ...mutation, republish };
}
