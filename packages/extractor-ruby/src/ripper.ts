/**
 * What Ruby itself reads out of each file, by way of the Ripper script beside this package.
 * Parsing Ruby is left to Ruby, so a syntax this side never heard of is still read the way the
 * language reads it.
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

export type Receiver =
  | { readonly kind: 'self' }
  | { readonly kind: 'value' }
  | ({ readonly kind: 'constant' } & ConstantReference);

/** A `def`. The owner is the full name of the class or module body around it, or '' at the top. */
export interface RubyMethod {
  readonly owner: string;
  readonly singleton: boolean;
  readonly name: string;
  readonly firstLine: number;
  readonly lastLine: number;
  readonly sourceHash: string;
}

/** A call site inside a `def`, which `method` names by its index in the methods of the file. */
export interface CallSite {
  readonly method: number;
  readonly line: number;
  readonly name: string;
  readonly receiver: Receiver;
  readonly expression: string;
}

export type RubyFile =
  | { readonly parsed: false }
  | {
      readonly parsed: true;
      readonly bodies: readonly string[];
      readonly methods: readonly RubyMethod[];
      readonly calls: readonly CallSite[];
    };

export interface RubyReport {
  /** The `RUBY_DESCRIPTION` of the ruby that read the files, which `ruby --version` prints. */
  readonly ruby: string;
  readonly files: Readonly<Record<string, RubyFile>>;
}

/**
 * A host that carries the script elsewhere, such as the npm package with the script in its dist
 * folder, names it in CALLMAP_RUBY_EXTRACTOR_SCRIPT.
 */
const SCRIPT =
  process.env['CALLMAP_RUBY_EXTRACTOR_SCRIPT'] ?? join(import.meta.dirname, '../ruby/read.rb');

/** A large app's report runs to tens of megabytes, far past the default pipe buffer. */
const MAX_OUTPUT = 1024 * 1024 * 1024;

const isReport = (value: unknown): value is RubyReport => {
  if (typeof value !== 'object' || value === null) return false;
  const { ruby, files } = value as Record<string, unknown>;
  return typeof ruby === 'string' && typeof files === 'object' && files !== null;
};

export const readRubyFiles = (repo: string, files: readonly string[]): RubyReport => {
  const finished = spawnSync('ruby', [SCRIPT, repo], {
    input: files.join('\n'),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
  });
  if (finished.error !== undefined)
    throw new ExtractionError(`ruby could not be started: ${finished.error.message}`);
  if (finished.status !== 0) throw new ExtractionError(finished.stderr.trim());
  const report: unknown = JSON.parse(finished.stdout);
  if (!isReport(report))
    throw new ExtractionError('the Ruby reader answered with something other than a report');
  return report;
};
