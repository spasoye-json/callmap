import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import { loadReaderPage, reviewHtmlOf } from './reader-page.ts';

const topBarOf = async (repo: string, ...flags: readonly string[]) => {
  const { window } = await loadReaderPage(reviewHtmlOf(repo, ...flags));
  const checkout = window.document.querySelector('.top-bar .checkout');
  return {
    names: checkout?.querySelector('.checkout-names')?.textContent ?? '',
    range: checkout?.querySelector('.checkout-range')?.textContent ?? '',
  };
};

const shortOf = (repo: string, revision: string): string =>
  git(repo, 'rev-parse', '--short', revision);

const cleanRangeOf = (repo: string): string =>
  `${shortOf(repo, 'feature~1')}…${shortOf(repo, 'HEAD')}`;

describe('the checkout in the top bar', () => {
  it('names the branch and the default branch, with the range from the merge base to HEAD', async () => {
    const repo = featureBranchRepo();
    git(repo, 'checkout', '--quiet', 'main');
    commitFile(repo, 'README.md', 'after the branch point\n');
    git(repo, 'checkout', '--quiet', 'feature');
    expect(await topBarOf(repo)).toEqual({
      names: 'feature vs main',
      range: cleanRangeOf(repo),
    });
  }, 60_000);

  it('names the default branch as git names it on the remote', async () => {
    const repo = featureBranchRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    expect((await topBarOf(repo)).names).toBe('feature vs origin/main');
  }, 60_000);

  it('shows a detached HEAD in place of the branch name', async () => {
    const repo = featureBranchRepo();
    git(repo, 'checkout', '--quiet', '--detach', 'HEAD');
    expect((await topBarOf(repo)).names).toBe('detached HEAD vs main');
  }, 60_000);

  it('names the base as the reader typed it, and starts the range at that commit', async () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      'src/money.ts',
      'export const half = (amount: number): number => amount / 2;\n',
    );
    expect(await topBarOf(repo, '--base', 'HEAD~1')).toEqual({
      names: 'feature vs HEAD~1',
      range: `${shortOf(repo, 'HEAD~1')}…${shortOf(repo, 'HEAD')}`,
    });
  }, 60_000);
});

describe('the uncommitted mark in the top bar', () => {
  const markedRangeOf = (repo: string): string => `${cleanRangeOf(repo)} + uncommitted changes`;
  const SCOPE = ['--scope', 'src/**'];

  it.each([
    [
      'an unstaged change',
      (repo: string) => {
        appendFileSync(join(repo, 'src/cart.ts'), '\nexport const unstaged = (): number => 1;\n');
      },
    ],
    [
      'a staged change',
      (repo: string) => {
        appendFileSync(join(repo, 'src/money.ts'), '\nexport const staged = (): number => 1;\n');
        git(repo, 'add', 'src/money.ts');
      },
    ],
    [
      'an untracked file',
      (repo: string) => {
        mkdirSync(join(repo, 'src/new'));
        writeFileSync(join(repo, 'src/new/fresh.ts'), 'export const fresh = (): number => 1;\n');
      },
    ],
  ])(
    'marks %s to a file in the scope',
    async (_, change) => {
      const repo = featureBranchRepo();
      change(repo);
      expect((await topBarOf(repo, ...SCOPE)).range).toBe(markedRangeOf(repo));
    },
    60_000,
  );

  it('leaves a clean tree unmarked', async () => {
    const repo = featureBranchRepo();
    expect((await topBarOf(repo, ...SCOPE)).range).toBe(cleanRangeOf(repo));
  }, 60_000);

  it('leaves a change to a file outside the scope unmarked', async () => {
    const repo = featureBranchRepo();
    appendFileSync(join(repo, 'tsconfig.json'), '\n');
    writeFileSync(join(repo, 'notes.txt'), 'not in the scope\n');
    expect((await topBarOf(repo, ...SCOPE)).range).toBe(cleanRangeOf(repo));
  }, 60_000);
});
