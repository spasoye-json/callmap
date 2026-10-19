import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export class GitError extends Error {
  override readonly name = 'GitError';
}

const gitOutput = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 30,
  });

const git = (cwd: string, ...args: readonly string[]): string => gitOutput(cwd, ...args).trim();

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

const REMOTE_HEAD = /^refs\/remotes\/(.+)\/HEAD$/;

const remoteHeadsOf = (root: string): readonly string[] => {
  const remotes = git(root, 'for-each-ref', '--format=%(refname)', 'refs/remotes/')
    .split('\n')
    .flatMap((ref) => REMOTE_HEAD.exec(ref)?.slice(1, 2) ?? []);
  return [
    ...remotes.filter((remote) => remote === 'origin'),
    ...remotes.filter((remote) => remote !== 'origin'),
  ]
    .map((remote) => `refs/remotes/${remote}/HEAD`)
    .filter((head) => succeeds(root, 'symbolic-ref', '--quiet', head));
};

export const defaultBranchOf = (root: string): string => {
  const [remoteHead] = remoteHeadsOf(root);
  if (remoteHead !== undefined) return git(root, 'symbolic-ref', '--quiet', '--short', remoteHead);
  const local = ['main', 'master'].find((branch) =>
    succeeds(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`),
  );
  if (local === undefined) {
    throw new GitError(
      `${root} has no remote head, no main and no master to find a base on. Name one with --base.`,
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

export const fileAt = (root: string, commit: string, file: string): string =>
  gitOutput(root, 'show', `${commit}:${file}`);

const packageFoldersOf = (root: string): readonly string[] =>
  git(root, 'ls-files', '--others', '--directory', '-z')
    .split('\0')
    .map((entry) => entry.replace(/\/$/, ''))
    .filter((folder) => basename(folder) === 'node_modules');

const linkPackageFolders = (root: string, worktree: string): readonly string[] =>
  packageFoldersOf(root).flatMap((folder) => {
    const link = join(worktree, folder);
    if (!existsSync(dirname(link)) || existsSync(link)) return [];
    symlinkSync(join(root, folder), link, 'junction');
    return [link];
  });

export const inWorktreeAt = async <T>(
  root: string,
  commit: string,
  read: (path: string) => Promise<T>,
): Promise<T> => {
  const parent = mkdtempSync(join(tmpdir(), 'callmap-base-'));
  const path = join(parent, 'base');
  git(root, 'worktree', 'add', '--detach', '--quiet', path, commit);
  const links: string[] = [];
  try {
    links.push(...linkPackageFolders(root, path));
    return await read(path);
  } finally {
    for (const link of links) unlinkSync(link);
    git(root, 'worktree', 'remove', '--force', path);
    rmSync(parent, { recursive: true, force: true });
  }
};
