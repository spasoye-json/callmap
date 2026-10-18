import type { FunctionId, GraphDocument, OpenEnd } from '@archmap/graph-document';
import type { FunctionMark } from './review.ts';
import { oneOfGroupsOf } from './one-of-groups.ts';
import type { OneOfGroup } from './one-of-groups.ts';
import { openEndsOf } from './open-ends.ts';
import { resolutionRateOf } from './rate.ts';
import type { ResolutionRate } from './rate.ts';

export interface HonestEdges {
  readonly openEnds: readonly OpenEnd[];
  readonly oneOfGroups: readonly OneOfGroup[];
  readonly resolutionRate: ResolutionRate;
}

export const honestEdgesOf = (
  { base, branch }: { readonly base: GraphDocument; readonly branch: GraphDocument },
  marks: ReadonlyMap<FunctionId, FunctionMark>,
): HonestEdges => {
  const graphOf = (caller: FunctionId): GraphDocument =>
    marks.get(caller) === 'removed' ? base : branch;
  return {
    openEnds: openEndsOf(marks.keys(), graphOf),
    oneOfGroups: oneOfGroupsOf(marks.keys(), graphOf),
    resolutionRate: resolutionRateOf(branch),
  };
};
