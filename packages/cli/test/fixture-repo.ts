import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixture-review', import.meta.url));

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

export const git = (repo: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: GIT_ENV }).trim();

const commitTree = (repo: string, tree: string, message: string): void => {
  for (const path of git(repo, 'ls-files')
    .split('\n')
    .filter((line) => line !== '')) {
    rmSync(join(repo, path));
  }
  cpSync(join(FIXTURE, tree), repo, { recursive: true });
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', message);
};

export const featureBranchRepo = (defaultBranch = 'main'): string => {
  const repo = mkdtempSync(join(tmpdir(), 'callmap-review-'));
  git(repo, 'init', '--quiet', '--initial-branch', defaultBranch);
  commitTree(repo, 'base', 'base');
  git(repo, 'checkout', '--quiet', '-b', 'feature');
  commitTree(repo, 'branch', 'branch');
  return repo;
};

export const featureBranchRepoWithUnchangedFiles = (): string => {
  const repo = featureBranchRepo();
  git(repo, 'checkout', '--quiet', 'main');
  cpSync(join(FIXTURE, 'unchanged'), repo, { recursive: true });
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', 'unchanged');
  git(repo, 'checkout', '--quiet', 'feature');
  git(repo, 'merge', '--quiet', '--no-edit', 'main');
  return repo;
};

export const fixtureText = (tree: 'base' | 'branch', file: string): string =>
  readFileSync(join(FIXTURE, tree, file), 'utf8');

export const commitFile = (repo: string, path: string, text: string): void => {
  writeFileSync(join(repo, path), text);
  git(repo, 'add', path);
  git(repo, 'commit', '--quiet', '--message', `write ${path}`);
};

export const COUNTDOWN = 'src/countdown.ts';

export const countdownRepo = (): string => {
  const repo = featureBranchRepo();
  commitFile(
    repo,
    COUNTDOWN,
    `export const countdown = (from: number): number => tick(from);

const tick = (left: number): number => (left > 0 ? tock(left - 1) : 0);

const tock = (left: number): number => tick(left);
`,
  );
  return repo;
};
