import type { FunctionId, GraphDocument, GraphFunction } from '@archmap/graph-document';
import { markedCallsOf } from './calls.ts';
import type { MarkedCall } from './calls.ts';
import { changesOf, functionsById } from './changes.ts';
import type { ChangeMark } from './changes.ts';
import { hopsOf, oneHopFrom } from './hops.ts';
import { honestEdgesOf } from './honest-edges.ts';
import type { HonestEdges } from './honest-edges.ts';

export type FunctionMark = ChangeMark | 'neighbour';

export interface MarkedFunction extends GraphFunction {
  readonly mark: FunctionMark;
}

export interface Review extends HonestEdges {
  readonly functions: readonly MarkedFunction[];
  readonly calls: readonly MarkedCall[];
}

export interface ReviewInput {
  readonly base: GraphDocument;
  readonly branch: GraphDocument;
}

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export const reviewOf = ({ base, branch }: ReviewInput): Review => {
  const baseFunctions = functionsById(base);
  const branchFunctions = functionsById(branch);
  const changes = changesOf(baseFunctions, branchFunctions);
  const baseHops = hopsOf(base.calls);
  const branchHops = hopsOf(branch.calls);

  const marks = new Map<FunctionId, FunctionMark>(changes);
  for (const changed of changes.keys()) {
    for (const id of [...oneHopFrom(baseHops, changed), ...oneHopFrom(branchHops, changed)]) {
      if (!marks.has(id)) marks.set(id, 'neighbour');
    }
  }

  const functions = [...marks]
    .sort(([left], [right]) => byText(left, right))
    .flatMap(([id, mark]): MarkedFunction[] => {
      const place = mark === 'removed' ? baseFunctions.get(id) : branchFunctions.get(id);
      return place === undefined ? [] : [{ ...place, mark }];
    });

  const calls = [...markedCallsOf(baseHops, branchHops, new Set(marks.keys()))].sort(
    (left, right) => byText(left.caller, right.caller) || byText(left.callee, right.callee),
  );

  return { functions, calls, ...honestEdgesOf({ base, branch }, marks) };
};
