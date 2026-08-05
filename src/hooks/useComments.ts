import { NKinds, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

export type CommentRoot = NostrEvent | URL | `#${string}`;

export interface CommentNode {
  event: NostrEvent;
  replies: CommentNode[];
}

export interface CommentRootIdentity {
  referenceTag: 'A' | 'E' | 'I';
  reference: string;
  kind: string;
  pubkey?: string;
  addressable: boolean;
  eventId?: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;

function tagValues(event: NostrEvent, name: string): string[][] {
  return event.tags.filter(([tag]) => tag === name);
}

function singleTagValue(event: NostrEvent, name: string): string | undefined {
  const tags = tagValues(event, name);
  return tags.length === 1 ? tags[0][1] : undefined;
}

export function commentRootIdentity(root: CommentRoot): CommentRootIdentity | null {
  if (typeof root === 'string') {
    return { referenceTag: 'I', reference: root, kind: '#', addressable: false };
  }
  if (root instanceof URL) {
    const kind = ['http:', 'https:'].includes(root.protocol)
      ? 'web'
      : root.protocol.replace(/:$/, '');
    return { referenceTag: 'I', reference: root.toString(), kind, addressable: false };
  }

  if (NKinds.addressable(root.kind)) {
    const d = singleTagValue(root, 'd');
    if (!d) return null;
    return {
      referenceTag: 'A',
      reference: `${root.kind}:${root.pubkey}:${d}`,
      kind: String(root.kind),
      pubkey: root.pubkey,
      addressable: true,
      eventId: root.id,
    };
  }
  if (NKinds.replaceable(root.kind)) {
    return {
      referenceTag: 'A',
      reference: `${root.kind}:${root.pubkey}:`,
      kind: String(root.kind),
      pubkey: root.pubkey,
      addressable: true,
      eventId: root.id,
    };
  }
  return {
    referenceTag: 'E',
    reference: root.id,
    kind: String(root.kind),
    pubkey: root.pubkey,
    addressable: false,
    eventId: root.id,
  };
}

export function commentRootKey(root: CommentRoot): string {
  return commentRootIdentity(root)?.reference ?? '';
}

export function validateComment(event: NostrEvent, root: CommentRoot): boolean {
  const identity = commentRootIdentity(root);
  if (!identity || event.kind !== 1111) return false;

  if (
    singleTagValue(event, identity.referenceTag) !== identity.reference ||
    singleTagValue(event, 'K') !== identity.kind ||
    (identity.pubkey && singleTagValue(event, 'P') !== identity.pubkey)
  ) {
    return false;
  }

  const parentKind = singleTagValue(event, 'k');
  const parentPubkey = singleTagValue(event, 'p');
  if (parentKind === '1111') {
    return HEX_64.test(singleTagValue(event, 'e') ?? '') && HEX_64.test(parentPubkey ?? '');
  }
  if (parentKind !== identity.kind) return false;

  const parentReferenceTag = identity.referenceTag.toLowerCase();
  if (singleTagValue(event, parentReferenceTag) !== identity.reference) return false;
  if (identity.pubkey && parentPubkey !== identity.pubkey) return false;

  // NIP-22 supplements an addressable top-level parent with its concrete revision.
  return !identity.addressable || HEX_64.test(singleTagValue(event, 'e') ?? '');
}

export function buildCommentTree(events: NostrEvent[], root: CommentRoot): CommentNode[] {
  const uniqueEvents = new Map(
    events
      .filter((event) => validateComment(event, root))
      .map((event) => [event.id, event]),
  );
  const nodes = new Map<string, CommentNode>(
    [...uniqueEvents.values()].map((event) => [event.id, { event, replies: [] }]),
  );
  const parentById = new Map<string, string>();

  for (const event of uniqueEvents.values()) {
    if (singleTagValue(event, 'k') !== '1111') continue;
    const parentId = singleTagValue(event, 'e');
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parentId && parent && parent.event.pubkey === singleTagValue(event, 'p') && parentId !== event.id) {
      parentById.set(event.id, parentId);
    }
  }

  const roots: CommentNode[] = [];
  for (const [id, node] of nodes) {
    const parent = parentById.get(id);
    if (parent) nodes.get(parent)?.replies.push(node);
    else if (singleTagValue(node.event, 'k') !== '1111') roots.push(node);
  }

  roots.sort((left, right) => right.event.created_at - left.event.created_at);
  for (const node of nodes.values()) {
    node.replies.sort((left, right) => left.event.created_at - right.event.created_at);
  }
  return roots;
}

export function useComments(root: CommentRoot, limit?: number) {
  const { nostr } = useNostr();
  const identity = commentRootIdentity(root);

  return useQuery({
    queryKey: ['nostr', 'comments', identity?.reference, limit],
    queryFn: async ({ signal }) => {
      if (!identity) return { comments: [], count: 0 };
      const filter: NostrFilter = { kinds: [1111] };
      filter[`#${identity.referenceTag}`] = [identity.reference];
      if (typeof limit === 'number') filter.limit = limit;

      const events = await nostr.query([filter], { signal });
      const validEvents = new Map(
        events
          .filter((event) => validateComment(event, root))
          .map((event) => [event.id, event]),
      );
      return {
        comments: buildCommentTree([...validEvents.values()], root),
        count: validEvents.size,
      };
    },
    enabled: identity !== null,
  });
}
