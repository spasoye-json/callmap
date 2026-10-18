import type { FunctionId } from '@archmap/graph-document';
import type { MarkedFunction } from './review.ts';

export interface LineChanges {
  readonly changed: readonly number[];
  readonly removedAbove: readonly number[];
}

export type ChangedLinesByFile = Readonly<Record<string, LineChanges>>;

export type ChangedLines = Readonly<Record<FunctionId, LineChanges>>;

export const changedLinesOf = (
  functions: readonly MarkedFunction[],
  changedLinesByFile: ChangedLinesByFile,
): ChangedLines =>
  Object.fromEntries(
    functions
      .filter(({ mark }) => mark === 'changed')
      .map(({ id, file, firstLine, lastLine }) => {
        const inside = (lines: readonly number[] = []): readonly number[] =>
          lines.filter((line) => line >= firstLine && line <= lastLine);
        const lines = changedLinesByFile[file];
        return [id, { changed: inside(lines?.changed), removedAbove: inside(lines?.removedAbove) }];
      }),
  );
