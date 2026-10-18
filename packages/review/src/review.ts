import type { FunctionId, GraphDocument, GraphFunction } from '@archmap/graph-document';
import { markedCallsOf } from './calls.ts';
import type { MarkedCall } from './calls.ts';
import { changedLinesOf } from './changed-lines.ts';
import type { ChangedLines, ChangedLinesByFile } from './changed-lines.ts';
import { changesOf, functionsById } from './changes.ts';
import type { ChangeMark } from './changes.ts';
import { hopsOf, oneHopFrom } from './hops.ts';
import { byText } from './order.ts';
import { resolutionOf } from './resolution.ts';
import type { Resolution } from './resolution.ts';

export type FunctionMark = ChangeMark | 'neighbour';

export interface MarkedFunction extends GraphFunction {
  readonly mark: FunctionMark;
}

export interface Review extends Resolution {
  readonly functions: readonly MarkedFunction[];
  readonly calls: readonly MarkedCall[];
  readonly changedLines: ChangedLines;
}

export interface ReviewInput {
  readonly base: GraphDocument;
  readonly branch: GraphDocument;
  readonly changedLinesByFile: ChangedLinesByFile;
}

export const reviewOf = (input: ReviewInput): Review => {
  const { base, branch } = input;
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

  return {
    functions,
    calls,
    changedLines: changedLinesOf(functions, input.changedLinesByFile),
    ...resolutionOf(input, marks),
  };
};
