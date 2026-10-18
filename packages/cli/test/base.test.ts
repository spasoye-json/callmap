import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import { loadReaderPage, pageDataOf, runArchmap } from './reader-page.ts';

const MONEY = 'src/money.ts';
const CART = 'src/cart.ts';

const BRANCH_CHANGES = {
  [`${CART}#legacyTotal`]: 'removed',
  [`${CART}#receipt`]: 'changed',
  [`${CART}#taxed`]: 'added',
};

const marksOfReview = (repo: string, ...flags: readonly string[]) => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return Object.fromEntries(
    pageDataOf(readFileSync(out, 'utf8')).review.functions.map(({ id, mark }) => [id, mark]),
  );
};

describe('the base of a review', () => {
  it('reviews the branch against the commit that --base names', () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      MONEY,
      `${readFileSync(join(repo, MONEY), 'utf8')}\nexport const half = (amount: number): number => amount / 2;\n`,
    );
    expect(marksOfReview(repo, '--base', 'HEAD~1')).toEqual({ [`${MONEY}#half`]: 'added' });
  }, 60_000);

  it('takes the merge base with the head of the remote before main', () => {
    const repo = featureBranchRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/trunk', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    git(repo, 'branch', '--force', 'main', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the merge base with main when the remote names no head', () => {
    const repo = featureBranchRepo();
    git(repo, 'branch', 'master', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the merge base with master when there is no main', () => {
    expect(marksOfReview(featureBranchRepo('master'))).toMatchObject(BRANCH_CHANGES);
  }, 60_000);
});

describe('a branch that changed no function', () => {
  it('gets a page that says so in place of an empty graph', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
    const finished = runArchmap([
      'review',
      featureBranchRepo(),
      '--no-open',
      '--out',
      out,
      '--base',
      'HEAD',
    ]);
    expect(finished.status, finished.stderr).toBe(0);

    const { window, graph } = loadReaderPage(readFileSync(out, 'utf8'));
    const message = window.document.querySelector('[role="status"]');
    expect(message?.textContent).toBe('The branch changed no function against its base.');
    expect(window.document.getElementById('graph')?.hidden).toBe(true);
    expect(graph.nodes()).toHaveLength(0);
  }, 60_000);
});
