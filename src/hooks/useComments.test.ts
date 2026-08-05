import type { NostrEvent } from '@nostrify/nostrify';
import { describe, expect, it } from 'vitest';

import { buildCommentTree, validateComment } from '@/hooks/useComments';
import { makeCommentTags } from '@/hooks/usePostComment';

const ROOT_AUTHOR = 'a'.repeat(64);
const ROOT_ID = 'b'.repeat(64);
const COMMENT_AUTHOR = 'c'.repeat(64);
const COORDINATE = `31923:${ROOT_AUTHOR}:weekly-run`;

const root: NostrEvent = {
  id: ROOT_ID,
  pubkey: ROOT_AUTHOR,
  kind: 31923,
  created_at: 1,
  content: '',
  tags: [['d', 'weekly-run']],
  sig: '0'.repeat(128),
};

function comment(id: string, parent: NostrEvent | null, createdAt: number): NostrEvent {
  return {
    id,
    pubkey: COMMENT_AUTHOR,
    kind: 1111,
    created_at: createdAt,
    content: id,
    tags: [
      ['A', COORDINATE],
      ['K', '31923'],
      ['P', ROOT_AUTHOR],
      ...(parent
        ? [['e', parent.id], ['k', '1111'], ['p', parent.pubkey]]
        : [['a', COORDINATE], ['e', ROOT_ID], ['k', '31923'], ['p', ROOT_AUTHOR]]),
    ],
    sig: '0'.repeat(128),
  };
}

describe('NIP-22 schedule comments', () => {
  it('publishes a stable A root and the current addressable revision as the top-level parent', () => {
    expect(makeCommentTags(root)).toEqual([
      ['A', COORDINATE],
      ['K', '31923'],
      ['P', ROOT_AUTHOR],
      ['a', COORDINATE],
      ['e', ROOT_ID],
      ['k', '31923'],
      ['p', ROOT_AUTHOR],
    ]);
  });

  it('requires the NIP-22 root and parent identity tags', () => {
    const valid = comment('1'.repeat(64), null, 2);
    expect(validateComment(valid, root)).toBe(true);
    expect(validateComment({ ...valid, tags: valid.tags.filter(([name]) => name !== 'K') }, root)).toBe(false);
    expect(validateComment({ ...valid, tags: valid.tags.map((tag) => tag[0] === 'P' ? ['P', COMMENT_AUTHOR] : tag) }, root)).toBe(false);
  });

  it('omits orphaned and cyclic replies while building one adjacency tree', () => {
    const top = comment('1'.repeat(64), null, 2);
    const reply = comment('2'.repeat(64), top, 3);
    const missingParent = { ...top, id: '9'.repeat(64), pubkey: 'd'.repeat(64) };
    const orphan = comment('3'.repeat(64), missingParent, 4);
    const cycleASeed = { ...top, id: '4'.repeat(64), pubkey: 'e'.repeat(64) };
    const cycleBSeed = { ...top, id: '5'.repeat(64), pubkey: 'f'.repeat(64) };
    const cycleA = { ...comment(cycleASeed.id, cycleBSeed, 5), pubkey: cycleASeed.pubkey };
    const cycleB = { ...comment(cycleBSeed.id, cycleASeed, 6), pubkey: cycleBSeed.pubkey };

    const tree = buildCommentTree([top, reply, orphan, cycleA, cycleB], root);
    const ids: string[] = [];
    const visit = (nodes: typeof tree) => nodes.forEach((node) => {
      ids.push(node.event.id);
      visit(node.replies);
    });
    visit(tree);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(tree.some((node) => node.event.id === orphan.id)).toBe(false);
    expect(tree.find((node) => node.event.id === top.id)?.replies[0]?.event.id).toBe(reply.id);
  });
});
