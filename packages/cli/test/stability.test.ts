import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { featureBranchRepo, git } from './fixture-repo.ts';
import { runArchmap } from './reader-page.ts';

const review = (repo: string, name: string): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), name);
  const finished = runArchmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

const checkoutOf = (repo: string) => ({
  head: git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
  commit: git(repo, 'rev-parse', 'HEAD'),
  status: git(repo, 'status', '--porcelain', '--untracked-files=all'),
  staged: git(repo, 'diff', '--cached'),
  unstaged: git(repo, 'diff'),
  worktrees: git(repo, 'worktree', 'list', '--porcelain'),
  untracked: readFileSync(join(repo, 'notes.txt'), 'utf8'),
});

describe('a review run', () => {
  it('leaves the branch, the index and the uncommitted files as they were', () => {
    const repo = featureBranchRepo();
    appendFileSync(join(repo, 'src/money.ts'), '\nexport const staged = (): number => 1;\n');
    git(repo, 'add', 'src/money.ts');
    appendFileSync(join(repo, 'src/cart.ts'), '\nexport const unstaged = (): number => 2;\n');
    writeFileSync(join(repo, 'notes.txt'), 'not for git\n');
    const before = checkoutOf(repo);

    review(repo, 'review.html');

    expect(checkoutOf(repo)).toEqual(before);
  }, 60_000);

  it('writes byte-identical pages for two runs on the same commits', () => {
    const repo = featureBranchRepo();
    expect(review(repo, 'second.html')).toBe(review(repo, 'first.html'));
  }, 60_000);

  it('writes the same page for two clones of the same commits in different folders', () => {
    const [first, second] = [featureBranchRepo(), featureBranchRepo()];
    expect(git(first, 'rev-parse', 'HEAD')).toBe(git(second, 'rev-parse', 'HEAD'));
    expect(review(second, 'review.html')).toBe(review(first, 'review.html'));
  }, 60_000);
});
