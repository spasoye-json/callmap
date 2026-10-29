import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { FunctionMark } from './review.ts';
import { oneOfGroupsOf } from './one-of-groups.ts';
import type { OneOfGroup } from './one-of-groups.ts';
import { openEndsOf } from './open-ends.ts';
import type { LanguageRate } from './rate.ts';
import type { ReviewGraphs } from './review-graphs.ts';

export interface Resolution {
  readonly openEnds: readonly OpenEnd[];
  readonly oneOfGroups: readonly OneOfGroup[];
  readonly resolutionRates: readonly LanguageRate[];
}

export const resolutionOf = (
  { base, branch, resolutionRates }: ReviewGraphs,
  marks: ReadonlyMap<FunctionId, FunctionMark>,
): Resolution => {
  const graphOf = (caller: FunctionId): CallGraph =>
    marks.get(caller) === 'removed' ? base : branch;
  return {
    openEnds: openEndsOf(marks.keys(), graphOf),
    oneOfGroups: oneOfGroupsOf(marks.keys(), graphOf),
    resolutionRates,
  };
};
