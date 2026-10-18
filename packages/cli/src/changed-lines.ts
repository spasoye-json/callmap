import { execFileSync } from 'node:child_process';
import type { Review } from '@archmap/review';
import type { ChangedLines } from '../page/data.ts';

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const BRANCH_FILE = /^\+\+\+ b\/(.+)$/;

const branchLinesOf = (diff: string): ReadonlyMap<string, ReadonlySet<number>> => {
  const lines = new Map<string, Set<number>>();
  let current: Set<number> | undefined;
  for (const text of diff.split('\n')) {
    const file = BRANCH_FILE.exec(text)?.[1];
    if (file !== undefined) {
      current = new Set();
      lines.set(file, current);
      continue;
    }
    if (text.startsWith('+++ ')) current = undefined;
    const hunk = HUNK.exec(text);
    if (hunk === null || current === undefined) continue;
    const first = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let line = first; line < first + count; line += 1) current.add(line);
  }
  return lines;
};

export const changedLinesOf = (root: string, base: string, review: Review): ChangedLines => {
  const diff = execFileSync(
    'git',
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      '--no-renames',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      base,
      '--',
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 },
  );
  const branchLines = branchLinesOf(diff);
  return Object.fromEntries(
    review.functions
      .filter(({ mark }) => mark === 'changed')
      .map(({ id, file, firstLine, lastLine }) => [
        id,
        [...(branchLines.get(file) ?? [])]
          .filter((line) => line >= firstLine && line <= lastLine)
          .sort((left, right) => left - right),
      ]),
  );
};
