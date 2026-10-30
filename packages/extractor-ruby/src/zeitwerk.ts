/**
 * Zeitwerk's naming rule: in a Rails app, a file under an autoload root names one constant by its
 * path, so Zeitwerk naming decides which constants an app has (ADR-0030). The classic autoloader
 * of Rails before 6 follows the same naming. A constant can exist with no body, such as
 * `Point = Struct.new(:x)` in `app/models/point.rb`, or a namespace made from a directory.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/** A Rails app is a directory that holds the file that boots one. */
const APP_MARKER = 'config/application.rb';

const INFLECTIONS = 'config/initializers/inflections.rb';

/** The directories under `app/` that Rails leaves out of its autoload roots. */
const NOT_AUTOLOADED = new Set(['assets', 'javascript', 'views']);

/**
 * Directories below an autoload root that are autoload roots of their own, so a concern in
 * `app/models/concerns/billable.rb` is `Billable` and not `Concerns::Billable`.
 */
const NESTED_ROOTS = ['app/models/concerns', 'app/controllers/concerns'];

/** `config.autoload_lib`, or `lib` added to the autoload or eager load paths. */
const AUTOLOADS_LIB = /\bautoload_lib\b|\b(?:autoload|eager_load)_paths\b[^\n]*\blib\b/;

const ACRONYM = /\bacronym\s*\(?\s*["']([^"']+)["']/g;
const INFLECT = /\binflect\s*\(([^)]*)\)/g;
const INFLECTED_PAIR = /["']([^"']+)["']\s*=>\s*["']([^"']+)["']/g;
const PATH_GEM = /^\s*gem\s+["'][^"'\n]+["'][^\n]*?(?:\bpath:|:path\s*=>)\s*["']([^"'\n]+)["']/gm;

interface Inflections {
  /** Each acronym by its lower case word, so `api` camelizes to `API`. */
  readonly acronyms: ReadonlyMap<string, string>;
  /** A whole file name that the Zeitwerk inflector names directly. */
  readonly overrides: ReadonlyMap<string, string>;
}

const prefixOf = (directory: string): string => (directory === '' ? '' : `${directory}/`);

const textOf = (repo: string, path: string): string => {
  const file = join(repo, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

/** The folder of each Rails app of the repo, '' for an app at the root. */
export const railsAppsOf = (files: readonly string[]): readonly string[] =>
  files
    .filter((path) => path === APP_MARKER || path.endsWith(`/${APP_MARKER}`))
    .map((path) => path.slice(0, -APP_MARKER.length).replace(/\/$/, ''));

/** The folders of the gems that the Gemfile of an app names by a path inside the repo. */
export const enginesOf = (repo: string, app: string): readonly string[] =>
  [...textOf(repo, `${prefixOf(app)}Gemfile`).matchAll(PATH_GEM)]
    .map(([, path = '']) => posix.normalize(posix.join(app, path)).replace(/\/$/, ''))
    .filter((engine) => !engine.startsWith('..'));

const inflectionsOf = (text: string): Inflections => ({
  acronyms: new Map(
    [...text.matchAll(ACRONYM)].map(([, acronym = '']) => [acronym.toLowerCase(), acronym]),
  ),
  overrides: new Map(
    [...text.matchAll(INFLECT)].flatMap(([, pairs = '']) =>
      [...pairs.matchAll(INFLECTED_PAIR)].map(([, file = '', constant = '']) => [file, constant]),
    ),
  ),
});

const camelize = (segment: string, { acronyms, overrides }: Inflections): string =>
  overrides.get(segment) ??
  segment
    .split('_')
    .map((word) => acronyms.get(word) ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

/** Every directory directly under `app/` of an app or an engine that holds a Ruby file. */
const appRootsOf = (directory: string, files: readonly string[]): readonly string[] => {
  const prefix = `${prefixOf(directory)}app/`;
  const roots = new Set<string>();
  for (const path of files) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1 || NOT_AUTOLOADED.has(rest.slice(0, slash))) continue;
    roots.add(prefix + rest.slice(0, slash));
    for (const nested of NESTED_ROOTS) {
      const root = `${prefixOf(directory)}${nested}`;
      if (path.startsWith(`${root}/`)) roots.add(root);
    }
  }
  return [...roots];
};

/**
 * The constants that the loader of one app names: each file under an autoload root, and each
 * namespace on the way. The roots are `app/*` of the app and of its engines, and `lib` when the
 * app autoloads it. A file belongs to the deepest root that holds it.
 */
export const zeitwerkNamesOf = (
  repo: string,
  app: string,
  engines: readonly string[],
  files: readonly string[],
): readonly string[] => {
  const inflections = inflectionsOf(textOf(repo, `${prefixOf(app)}${INFLECTIONS}`));
  const roots = [app, ...engines].flatMap((directory) => appRootsOf(directory, files));
  if (AUTOLOADS_LIB.test(textOf(repo, `${prefixOf(app)}${APP_MARKER}`)))
    roots.push(`${prefixOf(app)}lib`);

  const names = new Set<string>();
  for (const path of files) {
    const root = roots
      .filter((directory) => path.startsWith(`${directory}/`))
      .reduce<string | undefined>(
        (deepest, directory) =>
          deepest === undefined || directory.length > deepest.length ? directory : deepest,
        undefined,
      );
    if (root === undefined) continue;
    const segments = path
      .slice(root.length + 1, -'.rb'.length)
      .split('/')
      .map((segment) => camelize(segment, inflections));
    for (let depth = 1; depth <= segments.length; depth += 1)
      names.add(segments.slice(0, depth).join('::'));
  }
  return [...names];
};
