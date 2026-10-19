import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FunctionId, GraphDocument } from '@callmap/graph-document';
import type { Review } from '@callmap/review';
import type { LineSpan, SourceTexts, Sources } from '../page/data.ts';
import { fileAt } from './git.ts';

const textsOf = (files: Iterable<string>, read: (file: string) => string): SourceTexts =>
  Object.fromEntries([...new Set(files)].sort().map((file) => [file, read(file)]));

export const sourcesOf = (
  root: string,
  base: string,
  review: Review,
  branchGraph: GraphDocument,
): Sources => ({
  branch: textsOf(
    branchGraph.functions.map(({ file }) => file),
    (file) => readFileSync(join(root, file), 'utf8'),
  ),
  base: textsOf(
    review.functions
      .filter(({ mark }) => mark === 'removed' || mark === 'changed')
      .map(({ file }) => file),
    (file) => fileAt(root, base, file),
  ),
});

export const basePlacesOf = (
  review: Review,
  baseGraph: GraphDocument,
): Readonly<Record<FunctionId, LineSpan>> => {
  const changed = new Set(
    review.functions.filter(({ mark }) => mark === 'changed').map(({ id }) => id),
  );
  return Object.fromEntries(
    baseGraph.functions
      .filter(({ id }) => changed.has(id))
      .map(({ id, firstLine, lastLine }) => [id, { firstLine, lastLine }]),
  );
};
