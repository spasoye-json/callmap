/**
 * The editor link on a function: it opens the function's file and line in the reader's editor.
 *
 * It is a string built from the repo root and a location, so it stays in the core and never reads a
 * path off the disk. Every character outside a small safe set is percent-encoded, so the link that
 * reaches the system opener holds nothing a shell or a URL parser reads as syntax. The editor
 * decodes the path back before it opens the file.
 */

/** Where a function sits in the code: a file inside the repo and a line in it. */
export interface Location {
  readonly file: string;
  readonly line: number;
}

/** The one scheme and authority every editor link starts with. */
export const EDITOR_SCHEME = 'vscode://file';

const SAFE_PATH_CHARACTER = /^[A-Za-z0-9\-._~/]$/;

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

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

export const EDITORS = ['vscode', 'jetbrains'] as const;

export type Editor = (typeof EDITORS)[number];

const JETBRAINS_NAVIGATE = 'jetbrains://idea/navigate/reference';

const relativePathOf = (location: Location): string =>
  `${escapePath(location.file.replace(/^\/+/, ''))}:${String(location.line)}`;

const projectNameOf = (repoRoot: string): string => rootPathOf(repoRoot).split('/').pop() ?? '';

export const editorUrl = (
  repoRoot: string,
  location: Location,
  editor: Editor = 'vscode',
): string =>
  editor === 'jetbrains'
    ? `${JETBRAINS_NAVIGATE}?project=${projectNameOf(repoRoot)}&path=${relativePathOf(location)}`
    : `${EDITOR_SCHEME}${rootPathOf(repoRoot)}/${relativePathOf(location)}`;
