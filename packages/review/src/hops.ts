import type { Call, FunctionId } from '@archmap/graph-document';
import { addTo } from './indexes.ts';

export interface Hops {
  readonly callees: ReadonlyMap<FunctionId, ReadonlySet<FunctionId>>;
  readonly callers: ReadonlyMap<FunctionId, ReadonlySet<FunctionId>>;
}

const NONE: ReadonlySet<FunctionId> = new Set();

export const hopsOf = (calls: readonly Call[]): Hops => {
  const callees = new Map<FunctionId, Set<FunctionId>>();
  const callers = new Map<FunctionId, Set<FunctionId>>();
  for (const { caller, callee } of calls) {
    addTo(callees, caller, callee);
    addTo(callers, callee, caller);
  }
  return { callees, callers };
};

export const calleesOf = (hops: Hops, id: FunctionId): ReadonlySet<FunctionId> =>
  hops.callees.get(id) ?? NONE;

export const oneHopFrom = (hops: Hops, id: FunctionId): readonly FunctionId[] => [
  ...(hops.callers.get(id) ?? NONE),
  ...calleesOf(hops, id),
];
