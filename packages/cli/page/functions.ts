import type { FunctionId, GraphFunction } from '@callmap/graph-document';
import type { FunctionMark, MarkedCall } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { callKeyOf } from './scene.ts';

export type PageFunction = GraphFunction & { readonly mark?: FunctionMark };

export const pageFunctionsOf = (data: ReaderPageData): ReadonlyMap<FunctionId, PageFunction> =>
  new Map<FunctionId, PageFunction>([
    ...data.branchGraph.functions.map((graphFunction): [FunctionId, PageFunction] => [
      graphFunction.id,
      graphFunction,
    ]),
    ...data.review.functions.map((marked): [FunctionId, PageFunction] => [marked.id, marked]),
  ]);

export const markedCallsOf = (data: ReaderPageData): readonly MarkedCall[] => {
  const calls = new Map<string, MarkedCall>(
    data.review.calls.map((call): [string, MarkedCall] => [callKeyOf(call), call]),
  );
  for (const { caller, callee } of data.branchGraph.calls) {
    const key = callKeyOf({ caller, callee });
    if (!calls.has(key)) calls.set(key, { caller, callee, mark: 'kept' });
  }
  return [...calls.values()];
};

export const sourceLinesOf = (
  data: ReaderPageData,
  { file, firstLine, lastLine, mark }: PageFunction,
): readonly string[] => {
  const texts = mark === 'removed' ? data.sources.base : data.sources.branch;
  return (texts[file] ?? '').split(/\r?\n/).slice(firstLine - 1, lastLine);
};
