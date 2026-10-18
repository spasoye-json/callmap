/**
 * The editor deep link a node click opens (ADR-0006: editor integration is one URL scheme).
 *
 * It is a string built from the repo root and an anchor, so it stays in the core and never reads a
 * path off the disk. Every character outside a small safe set is percent-encoded, so the link that
 * reaches the system opener holds nothing a shell or a URL parser reads as syntax. The editor
 * decodes the path back before it opens the file.
 */

import type { Anchor } from './canvas-model.ts';

/** The one scheme and authority every editor deep link starts with. */
export const EDITOR_SCHEME = 'vscode://file';

const SAFE_PATH_CHARACTER = /^[A-Za-z0-9\-._~/]$/;

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

const URL_WINDOWS_DRIVE = /^\/[A-Za-z]:\//;

const percentEncode = (character: string): string =>
  Array.from(
    new TextEncoder().encode(character),
    (byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
  ).join('');

const escapePath = (path: string): string =>
  Array.from(path, (character) =>
    SAFE_PATH_CHARACTER.test(character) ? character : percentEncode(character),
  ).join('');

/** The root as a URL path: forward slashes, a leading slash, no trailing slash, the drive kept. */
const rootPathOf = (repoRoot: string): string => {
  if (WINDOWS_DRIVE.test(repoRoot)) {
    const root = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    return `/${root.slice(0, 2)}${escapePath(root.slice(2))}`;
  }
  if (repoRoot.startsWith('/')) return escapePath(repoRoot.replace(/\/+$/, ''));
  throw new TypeError(`the repo root must be an absolute path, and ${repoRoot} is not`);
};

export const editorUrl = (repoRoot: string, anchor: Anchor): string =>
  `${EDITOR_SCHEME}${rootPathOf(repoRoot)}/${escapePath(anchor.file.replace(/^\/+/, ''))}:${String(anchor.line)}`;

/** The file and line an editor deep link names. */
export interface EditorTarget {
  /** The absolute file path, decoded, with a Windows drive path given without its leading slash. */
  readonly path: string;
  readonly line: number;
}

const EDITOR_LINK = /^(\/.+):([1-9][0-9]*)$/;

/** Read an editor deep link back into its file and line, or null when it is not one. */
export const readEditorUrl = (url: string): EditorTarget | null => {
  if (!url.startsWith(`${EDITOR_SCHEME}/`)) return null;
  const parts = EDITOR_LINK.exec(url.slice(EDITOR_SCHEME.length));
  if (parts === null) return null;
  const [, encodedPath = '', line = ''] = parts;
  let path: string;
  try {
    path = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  return { path: URL_WINDOWS_DRIVE.test(path) ? path.slice(1) : path, line: Number(line) };
};
