import type { FlowDocument } from '@archmap/flow-document';

/**
 * Rank every node by its longest path from a node nothing leads to, so a step always sits to the
 * right of the step before it.
 *
 * The ranking is deterministic in the face of everything a traced flow can hold. Ties are broken
 * by node id, never by array order, so re-serialising a document cannot move a node. A flow that
 * loops back, which a retry or a poll does, has no topological order at all; when the ranking runs
 * out of nodes whose predecessors are all ranked, it takes the smallest remaining id and ranks it
 * against the predecessors it does have.
 */
export const rankNodes = (document: FlowDocument): ReadonlyMap<string, number> => {
  const ids = document.nodes.map((node) => node.id);
  const predecessors = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const edge of document.edges) {
    predecessors.get(edge.to)?.push(edge.from);
  }

  const ranks = new Map<string, number>();
  const remaining = new Set(ids);

  const rankAgainstRanked = (id: string): number => {
    const ranked = (predecessors.get(id) ?? [])
      .map((predecessor) => ranks.get(predecessor))
      .filter((rank): rank is number => rank !== undefined);
    return ranked.length === 0 ? 0 : Math.max(...ranked) + 1;
  };

  const isReady = (id: string): boolean =>
    (predecessors.get(id) ?? []).every((predecessor) => ranks.has(predecessor));

  while (remaining.size > 0) {
    const ready = [...remaining].filter(isReady).sort();
    /**
     * Every node left is in a cycle, so none of them will ever be ready. Taking the smallest id
     * breaks the loop at a fixed point, and it is taken off `remaining` itself, so the loop always
     * shrinks and there is no id to fall back to.
     */
    const batch = ready.length > 0 ? ready : [...remaining].sort().slice(0, 1);
    for (const id of batch) {
      ranks.set(id, rankAgainstRanked(id));
      remaining.delete(id);
    }
  }

  return ranks;
};
