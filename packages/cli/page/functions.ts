import type { FunctionId } from '@archmap/graph-document';
import type { MarkedFunction } from '@archmap/review';
import type { ReaderPageData } from './data.ts';

export const markedFunctionsOf = (data: ReaderPageData): ReadonlyMap<FunctionId, MarkedFunction> =>
  new Map<FunctionId, MarkedFunction>([
    ...data.graph.functions.map((graphFunction): [FunctionId, MarkedFunction] => [
      graphFunction.id,
      { ...graphFunction, mark: 'neighbour' },
    ]),
    ...data.review.functions.map((marked): [FunctionId, MarkedFunction] => [marked.id, marked]),
  ]);

export const sourceLinesOf = (
  data: ReaderPageData,
  { file, firstLine, lastLine, mark }: MarkedFunction,
): readonly string[] => {
  const texts = mark === 'removed' ? data.sources.base : data.sources.branch;
  return (texts[file] ?? '').split(/\r?\n/).slice(firstLine - 1, lastLine);
};
