/**
 * What every command that runs an AI pass shares: the reference graph rebuilt from the documents
 * an extract answered with, the source the pass reads, the map file, the stored key that opens a
 * provider, and the monthly spend every pass adds to. Discovery and trace both stand on these, so
 * a pass is priced, keyed, and refused the same way whichever pass it is.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addSpend, CurationError, monthOf, spendIn } from '@archmap/discovery';
import type { MonthlySpend, SourceFile } from '@archmap/discovery';
import { ReferenceGraphError, referenceGraphFromDocuments } from '@archmap/reference-graph';
import { StalenessError } from '@archmap/staleness';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { createLocalStore, defaultConfigDir } from './local-store.ts';
import { readMapFile } from './map-file.ts';
import type { MapFile } from './map-file.ts';
import { ProviderFailure } from './provider.ts';
import type { AiAnswer, AiProvider, AiRequest } from './provider.ts';
import { Refusal, requireDocuments } from './requests.ts';

export interface AiOptions {
  /** Where the key and the monthly spend live. Never inside a repo. */
  readonly configDir?: string;
  /** The provider a stored key opens. Anthropic, unless a test hands in a fake. */
  readonly providerFor?: (key: string) => AiProvider;
  readonly now?: () => Date;
}

/** A command the sidecar dispatches to by name once open and extract are ruled out. */
export type Command = (request: Record<string, unknown>) => Promise<unknown>;

export const graphOf = (request: Record<string, unknown>): ReferenceGraph => {
  try {
    return referenceGraphFromDocuments(...requireDocuments(request));
  } catch (error) {
    if (error instanceof ReferenceGraphError) throw new Refusal('graph-refused', error.message);
    throw error;
  }
};

/** The source of every file the graph knows, read from the repo as it stands now. */
export const sourcesOf = (repo: string, graph: ReferenceGraph): readonly SourceFile[] =>
  graph.files.map((file) => ({
    path: file.path,
    text: readFileSync(join(repo, file.path), 'utf8'),
  }));

export const mapOf = (repo: string, graph: ReferenceGraph): MapFile => {
  try {
    return readMapFile(repo, graph);
  } catch (error) {
    if (error instanceof CurationError || error instanceof StalenessError)
      throw new Refusal('map-file-refused', error.message);
    throw error;
  }
};

export const withProvider = async <Result>(run: () => Promise<Result>): Promise<Result> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderFailure) throw new Refusal('provider-failed', error.message);
    throw error;
  }
};

/** The parts of a pass's prompt a provider is sent. */
export const aiRequestOf = (prompt: AiRequest): AiRequest => ({
  system: prompt.system,
  prompt: prompt.prompt,
  outputSchema: prompt.outputSchema,
  maxOutputTokens: prompt.maxOutputTokens,
});

export interface AiAccount {
  /** The provider the stored key opens, refused as `no-api-key` when no key is stored. */
  provider(): AiProvider;
  storedKey(): string | null;
  storeKey(key: string): void;
  /** The month so far. */
  thisMonth(): MonthlySpend;
  /** Add what one answer cost to the month and answer with the month so far. */
  recordSpend(answer: AiAnswer): MonthlySpend;
}

export const createAiAccount = (options: AiOptions = {}): AiAccount => {
  const store = createLocalStore(options.configDir ?? defaultConfigDir());
  const providerFor =
    options.providerFor ?? ((apiKey: string) => createAnthropicProvider({ apiKey }));
  const now = options.now ?? (() => new Date());
  return {
    provider: () => {
      const key = store.readKey();
      if (key === null) {
        throw new Refusal('no-api-key', 'store an AI provider key before a pass that costs tokens');
      }
      return providerFor(key);
    },
    storedKey: () => store.readKey(),
    storeKey: (key) => {
      store.writeKey(key);
    },
    thisMonth: () => spendIn(store.readSpend(), monthOf(now())),
    recordSpend: (answer) => {
      const month = monthOf(now());
      store.writeSpend(addSpend(store.readSpend(), month, answer.usage, answer.price));
      return spendIn(store.readSpend(), month);
    },
  };
};
