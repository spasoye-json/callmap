/**
 * The load units of a repo (ADR-0030): the Ruby code that loads together, so that its constants
 * share one set of names. A load unit is one Rails app, the folder of one `.gemspec`, or else the
 * rest of the repo. 2 apps or 2 gems never run in one process, so a constant of one is never a
 * constant of another.
 */

import { enginesOf, railsAppsOf, zeitwerkNamesOf } from './zeitwerk.ts';
import type { RubyTree } from './walk.ts';

export interface LoadUnit {
  /** The files whose bodies and methods the unit indexes. */
  readonly files: readonly string[];
  /** The constants that exist in the unit with no body of their own. */
  readonly names: readonly string[];
}

interface Root {
  readonly directory: string;
  readonly rails: boolean;
  readonly files: string[];
}

const directoryOf = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
};

const holds = (directory: string, path: string): boolean =>
  directory === '' || path.startsWith(`${directory}/`);

/**
 * Each file belongs to the deepest app or gem folder that holds it, so a gem inside an app is a
 * unit of its own. An app wins over a gem of the same folder. An app also indexes the files of
 * each engine that its Gemfile names by a path, because the engine loads into the app.
 */
export const loadUnitsOf = (repo: string, tree: RubyTree): ((path: string) => LoadUnit) => {
  const roots = new Map<string, Root>();
  for (const directory of railsAppsOf(tree.files))
    roots.set(directory, { directory, rails: true, files: [] });
  for (const directory of tree.gemspecs.map(directoryOf))
    if (!roots.has(directory)) roots.set(directory, { directory, rails: false, files: [] });
  const rest: Root = { directory: '', rails: false, files: [] };

  const rootOf = (path: string): Root =>
    [...roots.values()]
      .filter(({ directory }) => holds(directory, path))
      .reduce<Root | undefined>(
        (deepest, root) =>
          deepest === undefined || root.directory.length > deepest.directory.length
            ? root
            : deepest,
        undefined,
      ) ?? rest;

  const homes = new Map<string, Root>();
  for (const path of tree.files) {
    const root = rootOf(path);
    root.files.push(path);
    homes.set(path, root);
  }

  const unitOf = (root: Root): LoadUnit => {
    if (!root.rails) return { files: root.files, names: [] };
    const engines = enginesOf(repo, root.directory);
    const files = [
      ...root.files,
      ...tree.files.filter(
        (path) => homes.get(path) !== root && engines.some((engine) => holds(engine, path)),
      ),
    ];
    return { files, names: zeitwerkNamesOf(repo, root.directory, engines, files) };
  };

  const units = new Map<Root, LoadUnit>();
  return (path) => {
    const root = homes.get(path) ?? rest;
    const known = units.get(root) ?? unitOf(root);
    units.set(root, known);
    return known;
  };
};
