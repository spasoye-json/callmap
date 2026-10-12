/**
 * The extractor contract: the document one extractor emits for one repo, under one scope.
 *
 * The core owns this contract and every extractor conforms to it (ADR-0009). A document names the
 * files the extractor claims, the reference edges between them, the language tag it stamps on all
 * of them, and the scope globs it was built under, and nothing else. The scope travels with the
 * document because a document built over one subtree of a monorepo is not a claim about the rest
 * of it: a reader that does not know the scope cannot tell an absent file from an unscoped one.
 */

import {
  EDGE_FIELDS,
  ReferenceGraphError,
  requireArray,
  requireFields,
  requireNonEmpty,
} from './contract.ts';
import { mergeReferenceGraphs } from './reference-graph.ts';
import type {
  LanguageTag,
  ReferenceEdge,
  ReferenceGraph,
  ReferenceGraphInput,
} from './reference-graph.ts';

/** What one extractor emits: files, reference edges, a language tag, and the scope it ran under. */
export interface ReferenceGraphDocument {
  /** The tag the extractor stamps on every file in the document. */
  readonly language: LanguageTag;
  /** The globs that limited which files entered the document. Empty is a repo no glob narrowed. */
  readonly scope: readonly string[];
  /** Every file the extractor claims, by repo-relative path. */
  readonly files: readonly string[];
  /** Every static reference edge between them, in the direction the source text reads. */
  readonly edges: readonly ReferenceEdge[];
}

const DOCUMENT_FIELDS: readonly string[] = ['language', 'scope', 'files', 'edges'];

/** A path that is absolute on Windows without the leading slash that says so, `C:/repo`. */
const DRIVE_LETTER = /^[A-Za-z]:/;

/**
 * A document reads its paths more strictly than the graph reads the ones it is handed: a path in a
 * document is repo-relative, reads with forward slashes, and spells a file one way only, so one
 * machine's document means the same thing on the next one and two documents cannot claim one file
 * under two names. A second spelling would be read as a second file: the duplicate-language check
 * of a merge would not see the pair, and a claim about `src/a.ts` would not be checked against the
 * document that named `./src/a.ts`. So a Windows separator, a leading slash, a drive letter, a
 * segment that climbs out of the repo, and a segment that names nothing at all, an empty one or a
 * bare dot, are all refused.
 */
const requirePath = (value: unknown, what: string): string => {
  const path = requireNonEmpty(value, what);
  if (path.includes('\\')) {
    throw new ReferenceGraphError(`${what} must read with forward slashes, not '${path}'`);
  }
  if (path.startsWith('/') || DRIVE_LETTER.test(path)) {
    throw new ReferenceGraphError(`${what} must be repo-relative, not '${path}'`);
  }
  const segments = path.split('/');
  if (segments.includes('..')) {
    throw new ReferenceGraphError(`${what} must stay inside the repo, not '${path}'`);
  }
  if (segments.some((segment) => segment === '' || segment === '.')) {
    throw new ReferenceGraphError(`${what} must spell a file one way, not '${path}'`);
  }
  return path;
};

/**
 * Read one extractor's document against the contract.
 *
 * What comes back is this module's own types, so nothing downstream reads a field by string key.
 * An edge that names a file the document does not list is not refused here: in a mixed repo the
 * file at the far end of a reference may be one another extractor claims, and only the merged
 * graph can tell that from a file nobody claims at all.
 */
export const readReferenceGraphDocument = (value: unknown): ReferenceGraphDocument => {
  const fields = requireFields(value, "an extractor's document", DOCUMENT_FIELDS);
  const language = requireNonEmpty(
    fields['language'],
    "the language tag of an extractor's document",
  );
  const scope = requireArray(fields, 'scope', "an extractor's document").map((glob) =>
    requireNonEmpty(glob, 'a scope glob'),
  );
  const files = requireArray(fields, 'files', "an extractor's document").map((path) =>
    requirePath(path, 'a file path'),
  );
  const edges = requireArray(fields, 'edges', "an extractor's document").map((entry) => {
    const edge = requireFields(entry, 'a reference edge an extractor emits', EDGE_FIELDS);
    return {
      from: requirePath(edge['from'], 'a reference edge source'),
      to: requirePath(edge['to'], 'a reference edge target'),
    };
  });
  return { language, scope, files, edges };
};

/** The document's files as the graph holds them: each path under the document's one language tag. */
const inputOf = (document: ReferenceGraphDocument): ReferenceGraphInput => ({
  files: document.files.map((path) => ({ path, language: document.language })),
  edges: document.edges,
});

/**
 * Index the documents every extractor that matched a repo emitted into one reference graph
 * (ADR-0009). Every document is read against the contract first, so one malformed extractor is
 * refused alone.
 */
export const referenceGraphFromDocuments = (
  ...documents: readonly ReferenceGraphDocument[]
): ReferenceGraph =>
  mergeReferenceGraphs(...documents.map(readReferenceGraphDocument).map(inputOf));
