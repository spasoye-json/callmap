/**
 * Zeitwerk's naming rule, read backwards: a Rails app has no import statement, so the file a
 * constant reference reaches is the file whose path Zeitwerk would derive from the constant's name
 * (ADR-0009). Each Rails app is its own set of autoload roots, because each one boots its own
 * loader, and a name one app defines means nothing to another.
 */

import type { ConstantReference } from './ripper.ts';

/** A Rails app is a directory that holds the file that boots one. */
const APP_MARKER = 'config/application.rb';

/**
 * Directories below an autoload root that are autoload roots of their own, so a concern in
 * `app/models/concerns/billable.rb` is `Billable` and not `Concerns::Billable`.
 */
const NESTED_ROOTS = ['app/models/concerns', 'app/controllers/concerns'];

/** One autoload root: a directory and the app whose loader owns it. */
interface AutoloadRoot {
  readonly directory: string;
  readonly app: string;
}

/**
 * What one app's loader can name: each constant, and the file that defines it, or `null` for a
 * namespace Zeitwerk makes up from a directory that has no file of its own.
 */
type ConstantTable = Map<string, string | null>;

/** A file Zeitwerk loads: the app it belongs to and the constant its path names. */
interface Autoloaded {
  readonly app: string;
  readonly constant: string;
}

const join = (directory: string, rest: string): string =>
  directory === '' ? rest : `${directory}/${rest}`;

const camelize = (segment: string): string =>
  segment
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

/**
 * The Rails apps of a repo and their autoload roots: every directory directly under `app/`, plus
 * the concern directories. A root is only named when a file sits under it, so an empty directory
 * adds nothing.
 */
const autoloadRootsOf = (files: readonly string[]): readonly AutoloadRoot[] => {
  const apps = files
    .filter((path) => path === APP_MARKER || path.endsWith(`/${APP_MARKER}`))
    .map((path) => path.slice(0, -APP_MARKER.length).replace(/\/$/, ''));

  const roots = new Map<string, string>();
  for (const app of apps) {
    const prefix = join(app, 'app/');
    for (const path of files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) continue;
      roots.set(prefix + rest.slice(0, slash), app);
      for (const nested of NESTED_ROOTS) {
        const directory = join(app, nested);
        if (path.startsWith(`${directory}/`)) roots.set(directory, app);
      }
    }
  }
  return [...roots].map(([directory, app]) => ({ directory, app }));
};

/**
 * The root that owns a file: the deepest one it sits under, which is how a concern belongs to its
 * concern root and not to `app/models`, and how an app nested inside another keeps its own files.
 */
const rootOf = (roots: readonly AutoloadRoot[], path: string): AutoloadRoot | undefined =>
  roots
    .filter((root) => path.startsWith(`${root.directory}/`))
    .reduce<AutoloadRoot | undefined>(
      (deepest, root) =>
        deepest === undefined || root.directory.length > deepest.directory.length ? root : deepest,
      undefined,
    );

/** The Zeitwerk view of a repo: which files each app's loader names, and what it names them. */
export interface Zeitwerk {
  /** The app and constant of a file Zeitwerk loads, or nothing for a file outside every root. */
  readonly autoloaded: (path: string) => Autoloaded | undefined;
  /**
   * The file a reference reaches inside its own app, or nothing when the name resolves to no file
   * of that app: a gem, the standard library, a constant defined inline, or a constant only another
   * app defines, which is a boundary and never a reference (ADR-0009).
   */
  readonly resolve: (app: string, reference: ConstantReference) => string | undefined;
}

export const zeitwerkOf = (files: readonly string[]): Zeitwerk => {
  const roots = autoloadRootsOf(files);
  const autoloadedFiles = new Map<string, Autoloaded>();
  const tables = new Map<string, ConstantTable>();

  for (const path of files) {
    const root = rootOf(roots, path);
    if (root === undefined) continue;
    const segments = path
      .slice(root.directory.length + 1, -'.rb'.length)
      .split('/')
      .map(camelize);
    const constant = segments.join('::');
    autoloadedFiles.set(path, { app: root.app, constant });
    const table = tables.get(root.app) ?? new Map<string, string | null>();
    tables.set(root.app, table);
    table.set(constant, path);
    for (let depth = 1; depth < segments.length; depth += 1) {
      const namespace = segments.slice(0, depth).join('::');
      if (!table.has(namespace)) table.set(namespace, null);
    }
  }

  /**
   * Ruby's lexical lookup for the first segment: the namespaces the reference was written inside,
   * innermost first, then the top level. The rest of the path is read inside whatever that found.
   */
  const resolve = (app: string, reference: ConstantReference): string | undefined => {
    const table = tables.get(app);
    if (table === undefined) return undefined;
    const [head, ...rest] = reference.path;
    if (head === undefined) return undefined;
    const lexical = reference.absolute
      ? [head]
      : [...reference.nesting.map((namespace) => [...namespace, head].join('::')), head];
    const found = lexical.find((candidate) => table.has(candidate));
    if (found === undefined) return undefined;
    return table.get([found, ...rest].join('::')) ?? undefined;
  };

  return { autoloaded: (path) => autoloadedFiles.get(path), resolve };
};
