/**
 * The Ruby extractor: it reads a repo of Rails apps in scope and emits the reference graph document
 * the core owns the contract for (ADR-0009).
 *
 * Rails code names a class and never the file it lives in, so a reference here is a constant
 * reference resolved the way Zeitwerk would load it, one set of autoload roots per app. Code
 * outside those roots is loaded by a `require` this extractor does not read, so it is claimed and
 * left without edges rather than given edges its loader may never make.
 */

import { resolve } from 'node:path';
import type { ReferenceGraphDocument } from '@callmap/reference-graph';
import { constantReferencesOf } from './references.ts';
import { inScope } from '@callmap/scope';
import { rubyFilesOf } from './walk.ts';
import { zeitwerkOf } from './zeitwerk.ts';

/** The tag this extractor stamps on every file it claims. */
export const RUBY = 'ruby';

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
}

/**
 * Read a repo and emit its reference graph document.
 *
 * Constants are resolved against every file of the app, in scope or not, so a reference whose file
 * the scope leaves out is dropped rather than resolved to the next name Ruby would have tried,
 * which is a file it would never have reached. An edge is emitted only when both ends are claimed.
 */
export const extractRuby = (options: ExtractOptions): ReferenceGraphDocument => {
  const repo = resolve(options.repo);
  const scope = options.scope ?? [];
  const everyFile = rubyFilesOf(repo);
  const files = everyFile.filter((path) => inScope(path, scope));
  const claimed = new Set(files);
  const zeitwerk = zeitwerkOf(everyFile);
  const references = constantReferencesOf(
    repo,
    files.filter((path) => zeitwerk.autoloaded(path) !== undefined),
  );

  const edges = [...references].flatMap(([from, found]) => {
    const app = zeitwerk.autoloaded(from)?.app;
    if (app === undefined) return [];
    const targets = new Set(
      found
        .map((reference) => zeitwerk.resolve(app, reference))
        .filter((to): to is string => to !== undefined && to !== from && claimed.has(to)),
    );
    return [...targets].sort().map((to) => ({ from, to }));
  });

  return { language: RUBY, scope, files, edges };
};
