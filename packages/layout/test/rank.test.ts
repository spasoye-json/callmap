import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone, verifiedEdge } from '@archmap/testing';
import type { FlowDocument } from '@archmap/flow-document';
import { rankNodes } from '../src/index.ts';

const chain = (...ids: readonly string[]): FlowDocument => {
  const flow = clone(checkoutFlow());
  return {
    ...flow,
    nodes: ids.map((id) => ({
      id,
      kind: 'step',
      label: id,
      lane: 'backend',
      file: flow.nodes[2]?.file ?? '',
      line: 1,
    })),
    edges: ids.slice(1).map((id, index) => verifiedEdge(ids[index] ?? '', id)),
  };
};

describe('rankNodes', () => {
  it('ranks the head of a chain at zero', () => {
    expect(rankNodes(chain('a', 'b', 'c')).get('a')).toBe(0);
  });

  it('ranks each step of a chain one further along', () => {
    const ranks = rankNodes(chain('a', 'b', 'c'));
    expect([ranks.get('a'), ranks.get('b'), ranks.get('c')]).toEqual([0, 1, 2]);
  });

  it('ranks the traced flow along its longest path', () => {
    const ranks = rankNodes(checkoutFlow());
    expect(ranks.get('tap-checkout')).toBe(0);
    expect(ranks.get('post-order')).toBe(1);
    expect(ranks.get('receive-order')).toBe(2);
    expect(ranks.get('check-cart')).toBe(3);
    expect(ranks.get('send-receipt')).toBe(6);
  });

  it('ranks the two branches of a decision at one rank', () => {
    const ranks = rankNodes(checkoutFlow());
    expect(ranks.get('reject-empty-cart')).toBe(ranks.get('persist-order'));
  });

  it('ranks a node by its longest path, not its shortest', () => {
    const flow = chain('a', 'b', 'c');
    const ranks = rankNodes({ ...flow, edges: [...flow.edges, verifiedEdge('a', 'c')] });
    expect(ranks.get('c')).toBe(2);
  });

  it('ranks a node nothing leads to at zero, even in the middle of a document', () => {
    const flow = chain('a', 'b', 'c');
    const nodes = [...flow.nodes, { ...flow.nodes[0], id: 'lonely', label: 'lonely' }];
    const ranks = rankNodes({ ...flow, nodes } as FlowDocument);
    expect(ranks.get('lonely')).toBe(0);
  });

  it('ranks every node of a candidate, of which there are none', () => {
    expect(rankNodes(candidate()).size).toBe(0);
  });

  it('ranks every node exactly once', () => {
    expect(rankNodes(checkoutFlow()).size).toBe(checkoutFlow().nodes.length);
  });

  it('does not depend on the order the nodes were written in', () => {
    const flow = chain('a', 'b', 'c');
    const reversed = { ...flow, nodes: [...flow.nodes].reverse() };
    expect([...rankNodes(reversed).entries()].sort()).toEqual(
      [...rankNodes(flow).entries()].sort(),
    );
  });

  it('does not depend on the order the edges were written in', () => {
    const flow = chain('a', 'b', 'c');
    const reversed = { ...flow, edges: [...flow.edges].reverse() };
    expect(rankNodes(reversed).get('c')).toBe(2);
  });

  it('terminates on a flow that loops back, which a retry does', () => {
    const flow = chain('a', 'b', 'c');
    const looping = { ...flow, edges: [...flow.edges, verifiedEdge('c', 'a')] };
    expect(rankNodes(looping).size).toBe(3);
  });

  it('ranks a loop the same way every time', () => {
    const flow = chain('a', 'b', 'c');
    const looping = { ...flow, edges: [...flow.edges, verifiedEdge('c', 'a')] };
    expect([...rankNodes(looping)]).toEqual([...rankNodes(looping)]);
  });

  it('breaks a loop at the smallest id, so the ranking never depends on array order', () => {
    const flow = chain('b', 'c', 'a');
    const looping = { ...flow, edges: [...flow.edges, verifiedEdge('a', 'b')] };
    expect(rankNodes(looping).get('a')).toBe(0);
  });

  it('ranks a two node loop', () => {
    const flow = chain('a', 'b');
    const looping = { ...flow, edges: [...flow.edges, verifiedEdge('b', 'a')] };
    expect([...rankNodes(looping).values()].sort()).toEqual([0, 1]);
  });
});
