/**
 * The sidecar: the Node process that owns every piece of logic the app runs (ADR-0006). The shell
 * hands it one JSON request at a time and hands back the JSON it answers with. Nothing here knows
 * about standard input or a window, so a test drives the whole surface by calling `handle`.
 */

import { resolve } from 'node:path';
import {
  readReferenceGraphDocument,
  ReferenceGraphError,
  referenceGraphFromDocuments,
} from '@archmap/reference-graph';
import type { ReferenceGraph, ReferenceGraphDocument } from '@archmap/reference-graph';
import { ExtractorFailure } from './extractors.ts';
import { REGISTERED_EXTRACTORS } from './registered-extractors.ts';
import { filesInScope, isDirectory } from './repo.ts';
import type { ExtractorRegistration, ExtractorRun } from './extractors.ts';
import type { ExtractResult, OpenResult, SidecarErrorCode, SidecarResponse } from './protocol.ts';

export interface SidecarOptions {
  /** The extractors a repo is read with. The ones version one ships, unless a test says otherwise. */
  readonly extractors?: readonly ExtractorRegistration[];
}

export interface Sidecar {
  /** Answer one request. A refusal is an answer too, so this never throws for a bad request. */
  handle(request: unknown): Promise<SidecarResponse<unknown>>;
}

/**
 * A refusal the reader sees. A command throws it, and `handle` turns it into an answer, so every
 * command refuses in the same shape and anything else that throws is not mistaken for one.
 */
class Refusal extends Error {
  override readonly name = 'Refusal';
  readonly code: SidecarErrorCode;

  constructor(code: SidecarErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireString = (request: Record<string, unknown>, field: string): string => {
  const value = request[field];
  if (typeof value !== 'string' || value === '') {
    throw new Refusal('malformed-request', `'${field}' must be a non-empty string`);
  }
  return value;
};

const requireStrings = (request: Record<string, unknown>, field: string): readonly string[] => {
  const value = request[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item !== '')) {
    throw new Refusal('malformed-request', `'${field}' must be a list of non-empty strings`);
  }
  return value as readonly string[];
};

/** The repo a request names, as an absolute path, refused when it is not a directory. */
const requireRepo = (request: Record<string, unknown>): string => {
  const repo = resolve(requireString(request, 'repo'));
  if (!isDirectory(repo)) throw new Refusal('repo-not-found', `${repo} is not a directory`);
  return repo;
};

export const createSidecar = (options: SidecarOptions = {}): Sidecar => {
  const extractors = options.extractors ?? REGISTERED_EXTRACTORS;

  const open = (request: Record<string, unknown>): OpenResult => {
    const repo = requireRepo(request);
    const scope = requireStrings(request, 'scope');
    const files = filesInScope(repo, scope);
    const languages = extractors
      .filter((extractor) => files.some((path) => extractor.claims(path)))
      .map((extractor) => extractor.language)
      .sort();
    return { repo, scope, languages };
  };

  const extractorOf = (language: string): ExtractorRegistration => {
    const extractor = extractors.find((candidate) => candidate.language === language);
    if (extractor === undefined) {
      throw new Refusal('unknown-language', `no extractor is registered for '${language}'`);
    }
    return extractor;
  };

  /**
   * Run one extractor and read what it emitted against the contract. A document that breaks the
   * contract is the extractor's failure, not the repo's, so it is reported as one.
   */
  const documentOf = async (
    extractor: ExtractorRegistration,
    run: ExtractorRun,
  ): Promise<ReferenceGraphDocument> => {
    try {
      return readReferenceGraphDocument(await extractor.extract(run));
    } catch (error) {
      if (error instanceof ExtractorFailure || error instanceof ReferenceGraphError) {
        throw new Refusal(
          'extractor-failed',
          `the ${extractor.language} extractor failed: ${error.message}`,
        );
      }
      throw error;
    }
  };

  /**
   * The documents are merged before anything is counted, so a pair of documents that cannot form
   * one reference graph is refused here and never reaches the reader as a count.
   */
  const extract = async (request: Record<string, unknown>): Promise<ExtractResult> => {
    const repo = requireRepo(request);
    const scope = requireStrings(request, 'scope');
    const chosen = requireStrings(request, 'languages').map(extractorOf);
    const documents = await Promise.all(
      chosen.map((extractor) => documentOf(extractor, { repo, scope })),
    );
    let graph: ReferenceGraph;
    try {
      graph = referenceGraphFromDocuments(...documents);
    } catch (error) {
      if (error instanceof ReferenceGraphError) throw new Refusal('graph-refused', error.message);
      throw error;
    }
    return {
      documents,
      summary: {
        files: graph.files.length,
        edges: graph.edges.length,
        languages: documents.map((document) => ({
          language: document.language,
          files: document.files.length,
          edges: document.edges.length,
        })),
      },
    };
  };

  const answer = (request: unknown): unknown => {
    if (!isRecord(request)) throw new Refusal('malformed-request', 'a request must be an object');
    const command = request['command'];
    if (command === 'open') return open(request);
    if (command === 'extract') return extract(request);
    throw new Refusal('unknown-command', `'${String(command)}' is not a command the sidecar knows`);
  };

  return {
    handle: async (request) => {
      try {
        return { ok: true, result: await answer(request) };
      } catch (error) {
        if (error instanceof Refusal) {
          return { ok: false, error: { code: error.code, message: error.message } };
        }
        throw error;
      }
    },
  };
};
