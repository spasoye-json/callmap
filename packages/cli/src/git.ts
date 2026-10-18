import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class GitError extends Error {
  override readonly name = 'GitError';
}

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const gitOr = (message: string, cwd: string, ...args: readonly string[]): string => {
  try {
    return git(cwd, ...args);
  } catch {
    throw new GitError(message);
  }
};

const succeeds = (cwd: string, ...args: readonly string[]): boolean => {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
};

export const repoRootOf = (path: string): string =>
  gitOr(`${path} is not inside a git repo`, path, 'rev-parse', '--show-toplevel');

export const defaultBranchOf = (root: string): string => {
  if (succeeds(root, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD')) {
    return git(root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  }
  const local = ['main', 'master'].find((branch) =>
    succeeds(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`),
  );
  if (local === undefined) {
    throw new GitError(
      `${root} has no origin/HEAD, no main and no master to find a base on; name one with --base`,
    );
  }
  return local;
};

export const mergeBaseOf = (root: string, branch: string): string =>
  gitOr(`HEAD shares no commit with ${branch} in ${root}`, root, 'merge-base', 'HEAD', branch);

export const commitOf = (root: string, revision: string): string =>
  gitOr(
    `the base '${revision}' is not a commit in ${root}`,
    root,
    'rev-parse',
    '--verify',
    '--quiet',
    `${revision}^{commit}`,
  );

export const shortCommitOf = (root: string, commit: string): string =>
  git(root, 'rev-parse', '--short', commit);

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
