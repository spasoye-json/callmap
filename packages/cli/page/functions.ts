import type { FunctionId } from '@archmap/graph-document';
import type { MarkedCall, MarkedFunction } from '@archmap/review';
import type { ReaderPageData } from './data.ts';
import { callKeyOf } from './scene.ts';

export const markedFunctionsOf = (data: ReaderPageData): ReadonlyMap<FunctionId, MarkedFunction> =>
  new Map<FunctionId, MarkedFunction>([
    ...data.branchGraph.functions.map((graphFunction): [FunctionId, MarkedFunction] => [
      graphFunction.id,
      { ...graphFunction, mark: 'neighbour' },
    ]),
    ...data.review.functions.map((marked): [FunctionId, MarkedFunction] => [marked.id, marked]),
  ]);

export const markedCallsOf = (data: ReaderPageData): readonly MarkedCall[] => {
  const calls = new Map<string, MarkedCall>(
    data.branchGraph.calls.map(({ caller, callee }): [string, MarkedCall] => [
      callKeyOf({ caller, callee }),
      { caller, callee, mark: 'kept' },
    ]),
  );
  for (const call of data.review.calls) calls.set(callKeyOf(call), call);
  return [...calls.values()];
};

export const sourceLinesOf = (
  data: ReaderPageData,
  { file, firstLine, lastLine, mark }: MarkedFunction,
): readonly string[] => {
  const texts = mark === 'removed' ? data.sources.base : data.sources.branch;
  return (texts[file] ?? '').split(/\r?\n/).slice(firstLine - 1, lastLine);
};
