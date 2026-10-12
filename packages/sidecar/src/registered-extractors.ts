/**
 * The extractors version one ships, each run as its own process (ADR-0009). Adding a language is
 * adding its registration to this list.
 */

import { createRequire } from 'node:module';
import { GO, GoExtractionError, goExtractorBinary } from '@archmap/extractor-go';
import { RUBY } from '@archmap/extractor-ruby';
import { understood } from '@archmap/extractor-typescript/walk';
import { ExtractorFailure, extractorArguments, runExtractorProcess } from './extractors.ts';
import type { ExtractorRegistration } from './extractors.ts';

const resolvePackage = createRequire(import.meta.url).resolve;

/** The TypeScript extractor, which also reads JavaScript. Node runs its `.ts` CLI as it stands. */
export const typescriptExtractor: ExtractorRegistration = {
  language: 'typescript',
  claims: (path) => understood(path),
  extract: (run) =>
    runExtractorProcess(process.execPath, [
      resolvePackage('@archmap/extractor-typescript/cli'),
      ...extractorArguments(run),
    ]),
};

/**
 * The Go extractor, a Go program built once per sidecar process. A toolchain that cannot build it
 * is that extractor's failure, so the reader sees it as one and not as a sidecar crash.
 */
export const goExtractor: ExtractorRegistration = {
  language: GO,
  claims: (path) => path.endsWith('.go'),
  extract: async (run) => {
    let binary: string;
    try {
      binary = goExtractorBinary();
    } catch (error) {
      if (error instanceof GoExtractionError) throw new ExtractorFailure(error.message);
      throw error;
    }
    return runExtractorProcess(binary, extractorArguments(run));
  },
};

/** The Ruby extractor, which resolves constants the way Zeitwerk loads them. Node runs its CLI. */
export const rubyExtractor: ExtractorRegistration = {
  language: RUBY,
  claims: (path) => path.endsWith('.rb'),
  extract: (run) =>
    runExtractorProcess(process.execPath, [
      resolvePackage('@archmap/extractor-ruby/cli'),
      ...extractorArguments(run),
    ]),
};

export const REGISTERED_EXTRACTORS: readonly ExtractorRegistration[] = [
  goExtractor,
  rubyExtractor,
  typescriptExtractor,
];
