import type { FunctionId, GraphFunction } from '@callmap/graph-document';
import type { FunctionMark, MarkedCall } from '@callmap/review';
import type { LineSpan, ReaderPageData, SourceTexts, Sources } from './data.ts';
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

export interface FunctionText {
  readonly firstLine: number;
  readonly text: string;
}

export type FunctionCode =
  | { readonly kind: 'diff'; readonly base: FunctionText; readonly branch: FunctionText }
  | { readonly kind: 'added' | 'removed' | 'kept'; readonly code: FunctionText };

const textOf = (
  texts: SourceTexts,
  file: string,
  { firstLine, lastLine }: LineSpan,
): FunctionText => ({
  firstLine,
  text: (texts[file] ?? '')
    .split(/\r?\n/)
    .slice(firstLine - 1, lastLine)
    .join('\n'),
});

export const functionCodeOf = (
  data: ReaderPageData,
  { base, branch }: Sources,
  shown: PageFunction,
): FunctionCode => {
  if (shown.mark === 'removed') return { kind: 'removed', code: textOf(base, shown.file, shown) };
  const code = textOf(branch, shown.file, shown);
  if (shown.mark === 'added') return { kind: 'added', code };
  const basePlace = shown.mark === 'changed' ? data.basePlaces[shown.id] : undefined;
  if (basePlace === undefined) return { kind: 'kept', code };
  return { kind: 'diff', base: textOf(base, shown.file, basePlace), branch: code };
};
