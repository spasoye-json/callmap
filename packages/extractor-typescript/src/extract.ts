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
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import { moduleSpecifiers } from './imports.ts';
import { sourceFilesInScope } from './walk.ts';

/** Thrown when the extractor cannot read what it was pointed at. */
export class ExtractionError extends Error {
  override readonly name = 'ExtractionError';
}

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
 * The compiler options the repo's own `tsconfig.json` sets, which is where path aliases live. The
 * config is read the compiler's own way, so a config that extends another inherits its aliases.
 *
 * A repo with no `tsconfig.json` at its root still has a reference graph, just one with no aliases
 * in it, so a config that is not there at all is not an error. A config that is there and cannot be
 * read is one, whether the extractor found it at the root or was told to read it, because every
 * alias would quietly go missing and the document would read as if the repo held no such reference.
 * `allowJs` is forced on either way, because the extractor claims JavaScript files and the resolver
 * would not otherwise look for one.
 */
const compilerOptions = (repo: string, tsconfig: string | undefined): ts.CompilerOptions => {
  const path = tsconfig === undefined ? `${repo}/tsconfig.json` : resolve(tsconfig);
  if (tsconfig === undefined && !ts.sys.fileExists(path))
    return { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const read = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
  if (read.error !== undefined || read.config === undefined)
    throw new ExtractionError(`${path} could not be read as a tsconfig`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(path, '..'));
  return { ...parsed.options, allowJs: true };
};

/** A resolved file as the document names it, or nothing when it lies outside the repo. */
const repoRelative = (repo: string, resolved: string): string | undefined => {
  const path = relative(repo, resolved).split('\\').join('/');
  return path === '' || path.startsWith('../') || isAbsolute(path) ? undefined : path;
};

/**
 * Read a repo and emit its reference graph document.
 *
 * An edge is emitted only when both of its ends are files the document claims. A reference into a
 * subtree the scope leaves out, or to a module nothing installed, is dropped rather than named,
 * because a document that named a file it does not claim would say the repo holds a file the scope
 * says nothing about. That one rule is also what keeps `node_modules` out, since the walk never
 * claims a file in it, and it is why a resolution that ran through `node_modules` is not refused
 * for that alone: in a monorepo, a package a repo links to itself resolves that way and lands back
 * on a file the repo does hold.
 *
 * A reference between two subtrees is therefore only in the document when one run takes both of
 * them in. Mapping a monorepo one subtree at a time is mapping each subtree's own references; the
 * references between two subtrees are read by naming both of them in one scope.
 */
export const extractTypeScript = (options: ExtractOptions): ReferenceGraphDocument => {
  const repo = resolve(options.repo);
  const scope = options.scope ?? [];
  const files = sourceFilesInScope(repo, scope);
  const claimed = new Set(files);
  const optionsOfRepo = compilerOptions(repo, options.tsconfig);
  const cache = ts.createModuleResolutionCache(repo, (name) => name, optionsOfRepo);

  /** What each file reaches, held as a set per file, so no file path is ever built into a key. */
  const reached = new Map<string, Set<string>>();

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
      if (resolvedModule === undefined) continue;
      const to = repoRelative(repo, resolvedModule.resolvedFileName);
      if (to === undefined || to === from || !claimed.has(to)) continue;
      const known = reached.get(from);
      if (known === undefined) reached.set(from, new Set([to]));
      else known.add(to);
    }
  }

  /** Files are walked in path order, so sorting each file's targets is all the order that is left. */
  const edges = [...reached].flatMap(([from, targets]) =>
    [...targets].sort().map((to) => ({ from, to })),
  );

  return { language: TYPESCRIPT, scope, files, edges };
};
