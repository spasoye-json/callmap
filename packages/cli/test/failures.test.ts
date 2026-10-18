import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import { runArchmap } from './reader-page.ts';

const BROKEN_CONFIG = '{ "compilerOptions": ';

const failedReview = (repo: string, ...flags: readonly string[]) => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status).not.toBe(0);
  expect(existsSync(out)).toBe(false);
  return finished.stderr.trim();
};

describe('a review that cannot run', () => {
  it('says so when the folder is not inside a git repo', () => {
    const folder = mkdtempSync(join(tmpdir(), 'archmap-plain-'));
    expect(failedReview(folder)).toBe(`${folder} is not inside a git repo`);
  });

  it('says so when the folder does not exist', () => {
    const folder = join(tmpdir(), 'archmap-no-such-folder');
    expect(failedReview(folder)).toBe(`${folder} is not inside a git repo`);
  });

  it('says so when --base names no commit', () => {
    const repo = featureBranchRepo();
    expect(failedReview(repo, '--base', 'no-such-branch')).toBe(
      `the base 'no-such-branch' is not a commit in ${repo}`,
    );
  }, 30_000);

  it('says so when the repo has no default branch to find a base on', () => {
    const repo = featureBranchRepo('trunk');
    expect(failedReview(repo)).toBe(
      `${repo} has no origin/HEAD, no main and no master to find a base on; name one with --base`,
    );
  }, 30_000);

  it('says so when the branch shares no commit with its base', () => {
    const repo = featureBranchRepo();
    git(repo, 'checkout', '--quiet', '--orphan', 'unrelated');
    git(repo, 'commit', '--quiet', '--message', 'unrelated');
    expect(failedReview(repo)).toBe(`HEAD shares no commit with main in ${repo}`);
  }, 30_000);

  it('says so when the TypeScript config of the branch cannot be read', () => {
    const repo = featureBranchRepo();
    writeFileSync(join(repo, 'tsconfig.json'), BROKEN_CONFIG);
    expect(failedReview(repo)).toBe(
      `the branch could not be read: tsconfig.json could not be read as a tsconfig`,
    );
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  }, 30_000);

  it('names the base, not a temporary folder, when the config of the base cannot be read', () => {
    const repo = featureBranchRepo();
    commitFile(repo, 'tsconfig.json', BROKEN_CONFIG);
    const broken = git(repo, 'rev-parse', '--short', 'HEAD');
    commitFile(repo, 'tsconfig.json', '{}');
    expect(failedReview(repo, '--base', 'HEAD~1')).toBe(
      `the base ${broken} could not be read: tsconfig.json could not be read as a tsconfig`,
    );
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  }, 30_000);
});
