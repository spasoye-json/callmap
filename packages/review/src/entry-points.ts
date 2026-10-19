import type { FunctionId, GraphDocument } from '@archmap/graph-document';
import { hopsOf } from './hops.ts';
import type { Hops } from './hops.ts';
import { byText } from './order.ts';

export interface EntryPoint {
  readonly id: FunctionId;
  readonly reachesChange: boolean;
}

const NONE: ReadonlySet<FunctionId> = new Set();

const reachedFrom = (
  starts: Iterable<FunctionId>,
  next: ReadonlyMap<FunctionId, ReadonlySet<FunctionId>>,
): ReadonlySet<FunctionId> => {
  const reached = new Set<FunctionId>();
  const waiting = [...starts];
  for (let id = waiting.shift(); id !== undefined; id = waiting.shift()) {
    if (reached.has(id)) continue;
    reached.add(id);
    waiting.push(...(next.get(id) ?? NONE));
  }
  return reached;
};

const isEntryPoint = (hops: Hops, id: FunctionId): boolean =>
  [...(hops.callers.get(id) ?? NONE)].every((caller) => caller === id);

export const entryPointsOf = (
  document: GraphDocument,
  changed: ReadonlySet<FunctionId> = NONE,
): readonly EntryPoint[] => {
  const hops = hopsOf(document.calls);
  const reachingChange = reachedFrom(changed, hops.callers);
  return document.functions
    .filter(({ id }) => isEntryPoint(hops, id))
    .map(({ id }) => ({ id, reachesChange: reachingChange.has(id) }))
    .sort(
      (left, right) =>
        Number(right.reachesChange) - Number(left.reachesChange) || byText(left.id, right.id),
    );
};

export const callTreeOf = (document: GraphDocument, entry: FunctionId): readonly FunctionId[] => [
  ...reachedFrom([entry], hopsOf(document.calls).callees),
];
