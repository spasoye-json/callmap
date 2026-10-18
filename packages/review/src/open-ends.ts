import type { FunctionId, GraphDocument, OpenEnd } from '@archmap/graph-document';

export type GraphOfCaller = (caller: FunctionId) => GraphDocument;

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export const openEndsOf = (
  shown: Iterable<FunctionId>,
  graphOf: GraphOfCaller,
): readonly OpenEnd[] =>
  [...shown]
    .flatMap((caller) => graphOf(caller).openEnds.filter((end) => end.caller === caller))
    .sort(
      (left, right) =>
        byText(left.caller, right.caller) ||
        left.line - right.line ||
        byText(left.expression, right.expression),
    );
