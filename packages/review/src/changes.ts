import type { FunctionId, GraphFunction } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';

export type ChangeMark = 'added' | 'removed' | 'changed';

export const functionsById = (graph: CallGraph): ReadonlyMap<FunctionId, GraphFunction> =>
  new Map(graph.functions.map((graphFunction) => [graphFunction.id, graphFunction]));

export const changesOf = (
  base: ReadonlyMap<FunctionId, GraphFunction>,
  branch: ReadonlyMap<FunctionId, GraphFunction>,
): ReadonlyMap<FunctionId, ChangeMark> => {
  const changes = new Map<FunctionId, ChangeMark>();
  for (const [id, after] of branch) {
    const before = base.get(id);
    if (before === undefined) changes.set(id, 'added');
    else if (before.sourceHash !== after.sourceHash) changes.set(id, 'changed');
  }
  for (const id of base.keys()) {
    if (!branch.has(id)) changes.set(id, 'removed');
  }
  return changes;
};
