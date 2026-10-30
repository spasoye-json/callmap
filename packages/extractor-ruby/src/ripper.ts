/**
 * What Ruby itself reads out of each file, by way of the Ripper script beside this package.
 * Parsing Ruby is left to Ruby, so a syntax this side never heard of is still read the way the
 * language reads it.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { OpenEndReason } from '@callmap/graph-document';

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

/** A value whose class the code shows, such as a literal or `Foo.new`. */
export interface MadeValue extends ConstantReference {
  /** The method of the class that made the value, such as `new`, or null for a literal. */
  readonly by: string | null;
}

export type Receiver =
  | { readonly kind: 'self' }
  | { readonly kind: 'super' }
  | { readonly kind: 'value' }
  | ({ readonly kind: 'constant' } & ConstantReference)
  | ({ readonly kind: 'made' } & MadeValue)
  /** A local variable, or an instance variable when its name starts with `@`. */
  | { readonly kind: 'variable'; readonly name: string };

/** A write of a variable in a def, with the value it sets, or null when the code does not show it. */
export interface VariableWrite {
  readonly name: string;
  readonly value: MadeValue | null;
}

/** A module that a body mixes in, by `include`, `prepend` or `extend`. */
export interface Mixin extends ConstantReference {
  readonly kind: 'include' | 'prepend' | 'extend';
}

/** A macro such as `attr_reader` or `has_many` in a class body, with its literal arguments. */
export interface Macro {
  readonly name: string;
  /** Written in `class << self`, so it makes methods of the class itself. */
  readonly singleton: boolean;
  readonly symbols: readonly string[];
  readonly options: Readonly<Record<string, string | true>>;
}

/**
 * One `class` or `module` keyword, by the full name it opened. A class can have many bodies. The
 * superclass is read in the nesting outside the body, and each mixin in the nesting inside it.
 */
export interface RubyBody {
  readonly name: string;
  readonly module: boolean;
  readonly superclass: ConstantReference | null;
  readonly mixins: readonly Mixin[];
  readonly macros: readonly Macro[];
}

/** The side of a class that a method or a macro belongs to: its instances, or the class itself. */
export type Side = 'instance' | 'singleton';

export const sideOf = ({ singleton }: { readonly singleton: boolean }): Side =>
  singleton ? 'singleton' : 'instance';

/** A `def`. The owner is the full name of the class or module body around it, or '' at the top. */
export interface RubyMethod {
  readonly owner: string;
  readonly singleton: boolean;
  readonly name: string;
  readonly firstLine: number;
  readonly lastLine: number;
  readonly sourceHash: string;
  /** Its only statement is `raise NotImplementedError`, so a subclass gives the method. */
  readonly abstract: boolean;
  readonly writes: readonly VariableWrite[];
}

/** A call site inside a `def`, which `method` names by its index in the methods of the file. */
export interface CallSite {
  readonly method: number;
  readonly line: number;
  readonly column: number;
  readonly name: string;
  readonly receiver: Receiver;
  readonly expression: string;
  /** Set when the call has no name that the rules can follow, such as `send(name)` or `yield`. */
  readonly open?: Extract<OpenEndReason, 'dynamic-key' | 'function-value'>;
}

export type RubyFile =
  | { readonly parsed: false }
  | {
      readonly parsed: true;
      readonly bodies: readonly RubyBody[];
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
