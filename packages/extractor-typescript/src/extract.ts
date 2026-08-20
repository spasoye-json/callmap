/**
 * The TypeScript extractor: it reads a repo in scope and emits the reference graph document the
 * core owns the contract for (ADR-0009).
 *
 * Module resolution is the compiler's own, so what the extractor calls a reference is what
 * TypeScript itself would have imported: a `tsconfig.json` path alias, a package export map, an
 * extensionless relative import, all of it. Nothing else here reads a name's meaning, so a repo
 * that does not compile still gives up its reference graph.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import type { ReferenceEdge, ReferenceGraphDocument } from '@archmap/reference-graph';
import { moduleSpecifiers } from './imports.ts';
import { sourceFilesInScope } from './walk.ts';

/** The tag this extractor stamps on every file it claims. */
export const TYPESCRIPT = 'typescript';

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
  /** The `tsconfig.json` to resolve against, if not the one at the root of the repo. */
  readonly tsconfig?: string;
}

/**
 * The compiler options the repo's own `tsconfig.json` sets, which is where path aliases live.
 *
 * A repo without one still has a reference graph, just one with no aliases in it, so a missing
 * config is not an error. `allowJs` is forced on either way, because the extractor claims
 * JavaScript files and the resolver would not otherwise look for one.
 */
const compilerOptions = (repo: string, tsconfig: string | undefined): ts.CompilerOptions => {
  const path = tsconfig === undefined ? `${repo}/tsconfig.json` : resolve(tsconfig);
  const read = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
  if (read.error !== undefined || read.config === undefined) {
    return { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(path, '..'));
  return { ...parsed.options, allowJs: true };
};

/** A resolved file as the document names it, or nothing when it lies outside the repo. */
const repoRelative = (repo: string, resolved: string): string | undefined => {
  const path = relative(repo, resolved).split('\\').join('/');
  return path === '' || path.startsWith('../') || isAbsolute(path) ? undefined : path;
};

const compareEdges = (left: ReferenceEdge, right: ReferenceEdge): number =>
  left.from === right.from
    ? left.to < right.to
      ? -1
      : left.to > right.to
        ? 1
        : 0
    : left.from < right.from
      ? -1
      : 1;

/**
 * Read a repo and emit its reference graph document.
 *
 * An edge is emitted only when both of its ends are files the document claims. A reference into
 * `node_modules`, into a subtree the scope leaves out, or to a module nothing installed is dropped
 * rather than named, because a document that named a file it does not claim would say the repo
 * holds a file the scope says nothing about.
 */
export const extractTypeScript = (options: ExtractOptions): ReferenceGraphDocument => {
  const repo = resolve(options.repo);
  const scope = options.scope ?? [];
  const files = sourceFilesInScope(repo, scope);
  const claimed = new Set(files);
  const optionsOfRepo = compilerOptions(repo, options.tsconfig);
  const cache = ts.createModuleResolutionCache(repo, (name) => name, optionsOfRepo);

  const edges = new Map<string, ReferenceEdge>();

  for (const from of files) {
    const containing = `${repo}/${from}`;
    for (const specifier of moduleSpecifiers(from, readFileSync(containing, 'utf8'))) {
      const { resolvedModule } = ts.resolveModuleName(
        specifier,
        containing,
        optionsOfRepo,
        ts.sys,
        cache,
      );
      if (resolvedModule === undefined || resolvedModule.isExternalLibraryImport === true) continue;
      const to = repoRelative(repo, resolvedModule.resolvedFileName);
      if (to === undefined || to === from || !claimed.has(to)) continue;
      edges.set(`${from}\u0000${to}`, { from, to });
    }
  }

  return {
    language: TYPESCRIPT,
    scope,
    files,
    edges: [...edges.values()].sort(compareEdges),
  };
};
