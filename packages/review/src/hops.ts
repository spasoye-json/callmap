import type { Call, FunctionId } from '@archmap/graph-document';

export interface Hops {
  readonly callees: ReadonlyMap<FunctionId, ReadonlySet<FunctionId>>;
  readonly callers: ReadonlyMap<FunctionId, ReadonlySet<FunctionId>>;
}

const NONE: ReadonlySet<FunctionId> = new Set();

const addTo = (index: Map<FunctionId, Set<FunctionId>>, from: FunctionId, to: FunctionId): void => {
  const known = index.get(from);
  if (known === undefined) index.set(from, new Set([to]));
  else known.add(to);
};

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
