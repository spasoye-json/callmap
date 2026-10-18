import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const succeeds = (cwd: string, ...args: readonly string[]): boolean => {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
};

export const repoRootOf = (path: string): string => git(path, 'rev-parse', '--show-toplevel');

export const defaultBranchOf = (root: string): string => {
  if (succeeds(root, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD')) {
    return git(root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  }
  return succeeds(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/main') ? 'main' : 'master';
};

export const mergeBaseOf = (root: string, branch: string): string =>
  git(root, 'merge-base', 'HEAD', branch);

export const inWorktreeAt = async <T>(
  root: string,
  commit: string,
  read: (path: string) => Promise<T>,
): Promise<T> => {
  const parent = mkdtempSync(join(tmpdir(), 'archmap-base-'));
  const path = join(parent, 'base');
  git(root, 'worktree', 'add', '--detach', '--quiet', path, commit);
  try {
    return await read(path);
  } finally {
    git(root, 'worktree', 'remove', '--force', path);
    rmSync(parent, { recursive: true, force: true });
  }
};
