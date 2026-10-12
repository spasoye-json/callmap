/**
 * The constant references Ruby itself reads out of a file, by way of the Ripper script beside this
 * package. Parsing Ruby is left to Ruby, so a syntax this side never heard of is still read the
 * way the language reads it.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/** Thrown when the extractor cannot read what it was pointed at. */
export class ExtractionError extends Error {
  override readonly name = 'ExtractionError';
}

/**
 * A constant as a file names it. `nesting` holds the namespaces the reference was written inside,
 * innermost first, each one as its segments, so `Foo` inside `module A; class B` carries
 * `[['A', 'B'], ['A']]`. An absolute reference, `::Foo`, skips the nesting.
 */
export interface ConstantReference {
  readonly nesting: readonly (readonly string[])[];
  readonly path: readonly string[];
  readonly absolute: boolean;
}

const SCRIPT = join(import.meta.dirname, '../ruby/references.rb');

/** A large app's references run to tens of megabytes, far past the default pipe buffer. */
const MAX_OUTPUT = 1024 * 1024 * 1024;

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isReference = (value: unknown): value is ConstantReference => {
  if (typeof value !== 'object' || value === null) return false;
  const { nesting, path, absolute } = value as Record<string, unknown>;
  return (
    Array.isArray(nesting) &&
    nesting.every(isStrings) &&
    isStrings(path) &&
    path.length > 0 &&
    typeof absolute === 'boolean'
  );
};

const readReport = (text: string): ReadonlyMap<string, readonly ConstantReference[]> => {
  const report: unknown = JSON.parse(text);
  if (typeof report !== 'object' || report === null || Array.isArray(report))
    throw new ExtractionError('the Ruby reader answered with something other than a report');
  const references = new Map<string, readonly ConstantReference[]>();
  for (const [path, found] of Object.entries(report)) {
    if (!Array.isArray(found) || !found.every(isReference))
      throw new ExtractionError(`the Ruby reader answered with a malformed entry for ${path}`);
    references.set(path, found);
  }
  return references;
};

/**
 * The constant references in each of the given repo-relative files. A file Ruby cannot parse is
 * reported rather than read as a file that references nothing, because the document would then say
 * the file has no references when it only says the reader failed.
 */
export const constantReferencesOf = (
  repo: string,
  files: readonly string[],
): ReadonlyMap<string, readonly ConstantReference[]> => {
  if (files.length === 0) return new Map();
  const finished = spawnSync('ruby', [SCRIPT, repo], {
    input: files.join('\n'),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
  });
  if (finished.error !== undefined)
    throw new ExtractionError(`ruby could not be started: ${finished.error.message}`);
  if (finished.status !== 0) throw new ExtractionError(finished.stderr.trim());
  return readReport(finished.stdout);
};
