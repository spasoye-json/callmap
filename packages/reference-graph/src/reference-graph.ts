/**
 * The reference graph: every static reference edge between a repo's files, as emitted by the
 * language extractors. It is the ground truth a claim about the code is checked against
 * (ADR-0001, ADR-0009).
 *
 * The core is language-blind, so a language tag is any non-empty string an extractor chooses.
 * This module never reads source code and never touches a filesystem; it only indexes what an
 * extractor already emitted.
 */

import {
  EDGE_FIELDS,
  ReferenceGraphError,
  requireArray,
  requireFields,
  requireNonEmpty,
} from './contract.ts';

/** The tag an extractor stamps on the files it claims, such as `typescript` or `ruby`. */
export type LanguageTag = string;

/** One file the reference graph knows, with the language of the extractor that claimed it. */
export interface ReferenceGraphFile {
  readonly path: string;
  readonly language: LanguageTag;
}

/** One static reference from one file to another, in the direction the source text reads. */
export interface ReferenceEdge {
  readonly from: string;
  readonly to: string;
}

/** What an extractor emits: the files it claims and the reference edges between them. */
export interface ReferenceGraphInput {
  readonly files: readonly ReferenceGraphFile[];
  readonly edges: readonly ReferenceEdge[];
}

/**
 * An indexed reference graph. Files and edges are held in a stable sorted order, so two graphs
 * built from the same edges read the same whatever order the extractor emitted them in.
 */
export interface ReferenceGraph {
  readonly files: readonly ReferenceGraphFile[];
  readonly edges: readonly ReferenceEdge[];
  /** Whether the graph knows this file at all. A claim about a file it does not know is rejected. */
  knows(path: string): boolean;
  /** The language of a known file, or `undefined` when the graph does not know it. */
  languageOf(path: string): LanguageTag | undefined;
  /** Whether a reference edge runs from `from` to `to`. */
  references(from: string, to: string): boolean;
  /**
   * Whether a reference edge joins the pair in either direction. Import direction and call
   * direction differ when a listener or a callback is registered, so a verified edge across two
   * files accepts the pair either way round (ADR-0004).
   */
  joins(a: string, b: string): boolean;
  /** Whether both files are known and carry the same language tag. */
  sameLanguage(a: string, b: string): boolean;
}

const comparePaths = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const byPath = (a: ReferenceGraphFile, b: ReferenceGraphFile): number =>
  comparePaths(a.path, b.path);

const OUTPUT_FIELDS: readonly string[] = ['files', 'edges'];
const FILE_FIELDS: readonly string[] = ['path', 'language'];

/**
 * Read one extractor's output against the contract.
 *
 * An extractor is a separate process (ADR-0009), so its output is data arriving over a contract and
 * not a value the compiler checked. The contract is narrow: files, reference edges, and a language
 * tag, and nothing else. A shape it does not allow is refused here as a `ReferenceGraphError`,
 * which is what that error is for, rather than escaping as a `TypeError` from the middle of
 * indexing. What comes back is the module's own types, so nothing downstream reads a field by
 * string key.
 */
const readOutput = (input: ReferenceGraphInput): ReferenceGraphInput => {
  const fields = requireFields(input, "an extractor's output", OUTPUT_FIELDS);
  const files = requireArray(fields, 'files', "an extractor's output").map((entry) => {
    const file = requireFields(entry, 'a file an extractor claims', FILE_FIELDS);
    const path = requireNonEmpty(file['path'], 'a file path');
    return { path, language: requireNonEmpty(file['language'], `the language of ${path}`) };
  });
  const edges = requireArray(fields, 'edges', "an extractor's output").map((entry) => {
    const edge = requireFields(entry, 'a reference edge an extractor emits', EDGE_FIELDS);
    return {
      from: requireNonEmpty(edge['from'], 'a reference edge source'),
      to: requireNonEmpty(edge['to'], 'a reference edge target'),
    };
  });
  return { files, edges };
};

/** Adjacency, held as a set per file, so no file path is ever concatenated into a key. */
type Adjacency = Map<string, Set<string>>;

const link = (adjacency: Adjacency, from: string, to: string): void => {
  const targets = adjacency.get(from);
  if (targets === undefined) adjacency.set(from, new Set([to]));
  else targets.add(to);
};

const linked = (adjacency: Adjacency, from: string, to: string): boolean =>
  adjacency.get(from)?.has(to) ?? false;

/**
 * Index one extractor's output into a reference graph.
 *
 * Refuses output the contract does not allow, a file with an empty path or an empty language tag, a
 * file claimed twice with two different languages, an edge that names a file the graph does not
 * list, and an edge from a file to itself. The same-file case of a verified edge is decided by the
 * file path alone, so a self-reference would only ever be noise.
 */
export const createReferenceGraph = (input: ReferenceGraphInput): ReferenceGraph =>
  indexOutput(readOutput(input));

const indexOutput = (output: ReferenceGraphInput): ReferenceGraph => {
  const languages = new Map<string, LanguageTag>();

  for (const { path, language } of output.files) {
    const claimed = languages.get(path);
    if (claimed !== undefined && claimed !== language) {
      throw new ReferenceGraphError(
        `${path} is claimed as ${claimed} and as ${language}; a file belongs to one extractor`,
      );
    }
    languages.set(path, language);
  }

  const directed: Adjacency = new Map();
  const undirected: Adjacency = new Map();

  for (const { from, to } of output.edges) {
    if (from === to) {
      throw new ReferenceGraphError(`${from} cannot hold a reference edge to itself`);
    }
    for (const path of [from, to]) {
      if (!languages.has(path)) {
        throw new ReferenceGraphError(
          `the reference edge ${from} to ${to} names ${path}, which the graph does not list`,
        );
      }
    }
    link(directed, from, to);
    link(undirected, from, to);
    link(undirected, to, from);
  }

  const files: readonly ReferenceGraphFile[] = [...languages]
    .map(([path, language]) => ({ path, language }))
    .sort(byPath);

  const edges: readonly ReferenceEdge[] = [...directed]
    .sort(([left], [right]) => comparePaths(left, right))
    .flatMap(([from, targets]) => [...targets].sort(comparePaths).map((to) => ({ from, to })));

  return {
    files,
    edges,
    knows: (path) => languages.has(path),
    languageOf: (path) => languages.get(path),
    references: (from, to) => linked(directed, from, to),
    joins: (a, b) => linked(undirected, a, b),
    sameLanguage: (a, b) => {
      const left = languages.get(a);
      const right = languages.get(b);
      return left !== undefined && left === right;
    },
  };
};

/**
 * Merge the output of every extractor that matched a repo into one reference graph (ADR-0009).
 * Merging is a union of files and of edges; a file two extractors claim with different languages
 * is a contradiction and is refused.
 */
export const mergeReferenceGraphs = (...inputs: readonly ReferenceGraphInput[]): ReferenceGraph => {
  /** Every output is read against the contract first, so one malformed extractor is refused alone. */
  const outputs = inputs.map(readOutput);
  return indexOutput({
    files: outputs.flatMap((output) => output.files),
    edges: outputs.flatMap((output) => output.edges),
  });
};

/** The empty reference graph: a repo no extractor has run over yet. */
export const emptyReferenceGraph = (): ReferenceGraph =>
  createReferenceGraph({ files: [], edges: [] });
