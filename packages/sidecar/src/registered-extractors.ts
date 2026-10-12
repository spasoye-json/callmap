/**
 * The extractors version one ships, each run as its own process (ADR-0009). Adding a language is
 * adding its registration to this list.
 */

import { createRequire } from 'node:module';
import { understood } from '@archmap/extractor-typescript/walk';
import { extractorArguments, runExtractorProcess } from './extractors.ts';
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

export const REGISTERED_EXTRACTORS: readonly ExtractorRegistration[] = [typescriptExtractor];
