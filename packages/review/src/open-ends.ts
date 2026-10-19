import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import type { GraphOfCaller } from './graph-of-caller.ts';
import { byText } from './order.ts';

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
