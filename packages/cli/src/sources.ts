import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphDocument } from '@archmap/graph-document';
import type { Review } from '@archmap/review';
import type { SourceTexts, Sources } from '../page/data.ts';

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
    review.functions.filter(({ mark }) => mark === 'removed').map(({ file }) => file),
    (file) =>
      execFileSync('git', ['show', `${base}:${file}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  ),
});
