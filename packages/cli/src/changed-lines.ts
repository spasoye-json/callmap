import type { ChangedLinesByFile } from '@callmap/review';
import { diffAgainst } from './git.ts';

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const BRANCH_FILE = /^\+\+\+ b\/(.+)$/;

interface FileLines {
  readonly changed: number[];
  readonly removedAbove: number[];
}

export const changedLinesByFileOf = (root: string, base: string): ChangedLinesByFile => {
  const files = new Map<string, FileLines>();
  let current: FileLines | undefined;
  for (const text of diffAgainst(root, base).split('\n')) {
    const file = BRANCH_FILE.exec(text)?.[1];
    if (file !== undefined) {
      current = { changed: [], removedAbove: [] };
      files.set(file, current);
      continue;
    }
    if (text.startsWith('+++ ')) current = undefined;
    const hunk = HUNK.exec(text);
    if (hunk === null || current === undefined) continue;
    const first = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) current.removedAbove.push(first + 1);
    for (let line = first; line < first + count; line += 1) current.changed.push(line);
  }
  return Object.fromEntries(files);
};
