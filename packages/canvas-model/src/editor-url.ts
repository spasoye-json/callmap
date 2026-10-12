/**
 * The editor deep link a node click opens (ADR-0006: editor integration is one URL scheme).
 *
 * It is a string built from the repo root and an anchor, so it stays in the core and never reads a
 * path off the disk. Only the characters that would end or reshape the path part of the URL are
 * escaped: a bracket in a route file name is kept, because the editor reads the path as it is.
 */

import type { Anchor } from './canvas-model.ts';

const URL_UNSAFE = /[%#?\s]/g;

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

const escapePath = (path: string): string =>
  path.replace(
    URL_UNSAFE,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

/** The root as a URL path: forward slashes, a leading slash, no trailing slash. */
const rootPathOf = (repoRoot: string): string => {
  if (WINDOWS_DRIVE.test(repoRoot)) return `/${repoRoot.replace(/\\/g, '/').replace(/\/+$/, '')}`;
  if (repoRoot.startsWith('/')) return repoRoot.replace(/\/+$/, '');
  throw new TypeError(`the repo root must be an absolute path, and ${repoRoot} is not`);
};

export const editorUrl = (repoRoot: string, anchor: Anchor): string => {
  const absolute = `${rootPathOf(repoRoot)}/${anchor.file.replace(/^\/+/, '')}`;
  return `vscode://file${escapePath(absolute)}:${String(anchor.line)}`;
};
