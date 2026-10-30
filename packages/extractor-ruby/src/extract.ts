/**
 * The Ruby extractor: it reads a repo and emits the graph document the core owns the contract for
 * (ADR-0009). Ruby has no type checker, so Callmap's own rules tie each call, and a call that they
 * do not prove is an open end (ADR-0027).
 */

import { resolve } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { Call, GraphDocument, GraphFunction, OpenEnd } from '@callmap/graph-document';
import { inScope } from '@callmap/scope';
import { readRubyFiles } from './ripper.ts';
import type { RubyBody, RubyMethod } from './ripper.ts';
import { resolverOf } from './resolution.ts';
import type { IndexedMethod } from './resolution.ts';
import { loadUnitsOf } from './units.ts';
import type { LoadUnit } from './units.ts';
import { rubyTreeOf } from './walk.ts';

/** The tag this extractor stamps on every file it claims. */
export const RUBY = 'ruby';

const RUBY_CHECKER = 'Callmap Ruby rules';

/** Raise it when a rule changes, so the checker on the page names the rules that ran. */
const RUBY_RULES_VERSION = '3';

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
}

export interface RubyRead {
  readonly document: GraphDocument;
  /** The files in scope that Ripper could not parse, which the document claims with no function. */
  readonly unparsed: readonly string[];
}

const nameOf = ({ owner, singleton, name }: RubyMethod): string => {
  if (owner === '') return name;
  return `${owner}${singleton ? '.' : '#'}${name}`;
};

/**
 * Every Ruby file of the repo is read, in scope or not, because a call on a constant ties through
 * every body of its class. A callee outside the scope is then a library call.
 */
export const readRuby = (options: ExtractOptions): RubyRead => {
  const repo = resolve(options.repo);
  const scope = options.scope ?? [];
  const tree = rubyTreeOf(repo);
  const everyFile = tree.files;
  const files = everyFile.filter((path) => inScope(path, scope));
  const report = readRubyFiles(repo, everyFile);

  const bodiesOfFile = new Map<string, readonly RubyBody[]>();
  const methodsOfFile = new Map<string, readonly IndexedMethod[]>();
  for (const path of everyFile) {
    const read = report.files[path];
    if (read?.parsed !== true) continue;
    bodiesOfFile.set(path, read.bodies);
    const seen = new Map<string, number>();
    const indexed = read.methods.map((method) => {
      const name = nameOf(method);
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return {
        ...method,
        file: path,
        id: count === 1 ? `${path}#${name}` : `${path}#${name}~${count}`,
      };
    });
    methodsOfFile.set(path, indexed);
  }

  const claimed = new Set(files);
  const definedNames = new Set([...methodsOfFile.values()].flat().map(({ name }) => name));
  const unitOf = loadUnitsOf(repo, tree);
  const resolvers = new Map<LoadUnit, ReturnType<typeof resolverOf>>();
  const resolverIn = (unit: LoadUnit) => {
    const known =
      resolvers.get(unit) ??
      resolverOf(
        {
          bodies: unit.files.flatMap((path) => bodiesOfFile.get(path) ?? []),
          methods: unit.files.flatMap((path) => methodsOfFile.get(path) ?? []),
          names: unit.names,
        },
        definedNames,
        claimed,
      );
    resolvers.set(unit, known);
    return known;
  };
  const functions: GraphFunction[] = [];
  const calls: Call[] = [];
  const openEnds: OpenEnd[] = [];
  for (const path of files) {
    const read = report.files[path];
    const indexed = methodsOfFile.get(path) ?? [];
    for (const method of indexed) {
      functions.push({
        id: method.id,
        name: nameOf(method),
        file: path,
        firstLine: method.firstLine,
        lastLine: method.lastLine,
        sourceHash: method.sourceHash,
      });
    }
    if (read?.parsed !== true) continue;
    const resolutionOf = resolverIn(unitOf(path));
    for (const site of read.calls) {
      const caller = indexed[site.method];
      if (caller === undefined) continue;
      const resolution = resolutionOf(site, caller);
      if (resolution.kind === 'call')
        calls.push({ caller: caller.id, callee: resolution.callee, line: site.line });
      if (resolution.kind === 'open-end')
        openEnds.push({
          caller: caller.id,
          line: site.line,
          expression: site.expression,
          reason: resolution.reason,
        });
    }
  }

  const document = readGraphDocument({
    language: RUBY,
    checker: { name: RUBY_CHECKER, version: `${RUBY_RULES_VERSION}, ${report.ruby}` },
    scope,
    files,
    functions,
    calls,
    openEnds,
  });
  return {
    document,
    unparsed: files.filter((path) => report.files[path]?.parsed === false),
  };
};

export const extractRuby = (options: ExtractOptions): GraphDocument => readRuby(options).document;
