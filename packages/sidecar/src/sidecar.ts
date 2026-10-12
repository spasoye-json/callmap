/**
 * The sidecar: the Node process that owns every piece of logic the app runs (ADR-0006). The shell
 * hands it one JSON request at a time and hands back the JSON it answers with. Nothing here knows
 * about standard input or a window, so a test drives the whole surface by calling `handle`.
 */

import { readReferenceGraphDocument, ReferenceGraphError } from '@archmap/reference-graph';
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import { ExtractorFailure } from './extractors.ts';
import { REGISTERED_EXTRACTORS } from './registered-extractors.ts';
import { createDiscoveryCommands } from './discovery-commands.ts';
import { createEditorCommands, systemUrlOpener } from './editor.ts';
import type { UrlOpener } from './editor.ts';
import { mergedGraphOf } from './passes.ts';
import type { AiOptions } from './passes.ts';
import { createTraceCommands } from './trace-commands.ts';
import { filesInScope } from './repo.ts';
import { isRecord, Refusal, requireRepo, requireStrings } from './requests.ts';
import type { ExtractorRegistration, ExtractorRun } from './extractors.ts';
import type { ExtractResult, OpenResult, SidecarResponse } from './protocol.ts';

export interface SidecarOptions {
  /** The extractors a repo is read with. The ones version one ships, unless a test says otherwise. */
  readonly extractors?: readonly ExtractorRegistration[];
  /** Where the key and the spend live and which provider a key opens. A test hands in a fake. */
  readonly ai?: AiOptions;
  /** How an editor deep link reaches the editor. The system opener, unless a test records it. */
  readonly openUrl?: UrlOpener;
}

export interface Sidecar {
  /** Answer one request. A refusal is an answer too, so this never throws for a bad request. */
  handle(request: unknown): Promise<SidecarResponse<unknown>>;
}

export const createSidecar = (options: SidecarOptions = {}): Sidecar => {
  const extractors = options.extractors ?? REGISTERED_EXTRACTORS;
  const commands = new Map([
    ...createDiscoveryCommands(options.ai),
    ...createTraceCommands(options.ai),
    ...createEditorCommands(options.openUrl ?? systemUrlOpener),
  ]);

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
    const graph = mergedGraphOf(documents);
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
    const named = typeof command === 'string' ? commands.get(command) : undefined;
    if (named !== undefined) return named(request);
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
