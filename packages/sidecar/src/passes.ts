/**
 * What every command that runs an AI pass shares: the reference graph rebuilt from the documents
 * an extract answered with, the source the pass reads, the map file, the stored key that opens a
 * provider, and the monthly spend every pass adds to. Discovery and trace both stand on these, so
 * a pass is priced, keyed, and refused the same way whichever pass it is.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addSpend, estimateOf, monthOf, spendIn } from '@archmap/cost';
import type { CostEstimate, MonthlySpend } from '@archmap/cost';
import { CurationError } from '@archmap/discovery';
import type { SourceFile } from '@archmap/discovery';
import { ReferenceGraphError, referenceGraphFromDocuments } from '@archmap/reference-graph';
import type { ReferenceGraph, ReferenceGraphDocument } from '@archmap/reference-graph';
import { StalenessError } from '@archmap/staleness';
import { createAnthropicProvider } from './anthropic-provider.ts';
import type { EstimateResult } from './cost-protocol.ts';
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

/** Merge the documents into one reference graph, refused as `graph-refused` when they cannot. */
export const mergedGraphOf = (documents: readonly ReferenceGraphDocument[]): ReferenceGraph => {
  try {
    return referenceGraphFromDocuments(...documents);
  } catch (error) {
    if (error instanceof ReferenceGraphError) throw new Refusal('graph-refused', error.message);
    throw error;
  }
};

export const graphOf = (request: Record<string, unknown>): ReferenceGraph =>
  mergedGraphOf(requireDocuments(request));

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
    if (error instanceof CurationError) throw new Refusal(error.code, error.message);
    if (error instanceof StalenessError) throw new Refusal('map-file-refused', error.message);
    throw error;
  }
};

const withProvider = async <Result>(run: () => Promise<Result>): Promise<Result> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderFailure) throw new Refusal('provider-failed', error.message);
    throw error;
  }
};

/** One pass as a provider is sent it, and the output it is expected to write for the estimate. */
export interface PassRequest {
  readonly request: AiRequest;
  readonly expectedOutputTokens: number;
}

/** The parts of a pass's prompt a provider is sent, and what the estimate counts on. */
export const passRequestOf = (
  prompt: AiRequest & { readonly expectedOutputTokens: number },
): PassRequest => ({
  request: {
    system: prompt.system,
    prompt: prompt.prompt,
    outputSchema: prompt.outputSchema,
    maxOutputTokens: prompt.maxOutputTokens,
  },
  expectedOutputTokens: prompt.expectedOutputTokens,
});

/** What one pass answered, what it cost, and the month so far with it. */
export interface PassAnswer {
  readonly text: string;
  readonly spent: CostEstimate;
  readonly month: MonthlySpend;
}

export interface AiAccount {
  storedKey(): string | null;
  storeKey(key: string): void;
  thisMonth(): MonthlySpend;
  /**
   * Count what a pass would cost, without running it. The pass is built only once a key is known
   * to be stored, so a missing key is refused before any source is read.
   */
  estimate(pass: () => PassRequest): Promise<EstimateResult>;
  /**
   * Run a pass and add what it cost to the month. The spend is recorded before the answer is
   * read: the tokens are spent whether or not the answer can be read, and the monthly total must
   * not hide a failed pass.
   */
  run(pass: () => PassRequest): Promise<PassAnswer>;
}

export const createAiAccount = (options: AiOptions = {}): AiAccount => {
  const store = createLocalStore(options.configDir ?? defaultConfigDir());
  const providerFor =
    options.providerFor ?? ((apiKey: string) => createAnthropicProvider({ apiKey }));
  const now = options.now ?? (() => new Date());

  const provider = (): AiProvider => {
    const key = store.readKey();
    if (key === null) {
      throw new Refusal('no-api-key', 'store an AI provider key before a pass that costs tokens');
    }
    return providerFor(key);
  };

  const thisMonth = (): MonthlySpend => spendIn(store.readSpend(), monthOf(now()));

  const recordSpend = (answer: AiAnswer): MonthlySpend => {
    const month = monthOf(now());
    store.writeSpend(addSpend(store.readSpend(), month, answer.usage, answer.price));
    return spendIn(store.readSpend(), month);
  };

  return {
    storedKey: () => store.readKey(),
    storeKey: (key) => {
      store.writeKey(key);
    },
    thisMonth,
    estimate: async (pass) => {
      const opened = provider();
      const { request, expectedOutputTokens } = pass();
      const inputTokens = await withProvider(() => opened.countInputTokens(request));
      return {
        estimate: estimateOf(
          opened.model,
          { inputTokens, outputTokens: expectedOutputTokens },
          opened.price,
        ),
        month: thisMonth(),
      };
    },
    run: async (pass) => {
      const opened = provider();
      const answer = await withProvider(() => opened.complete(pass().request));
      const month = recordSpend(answer);
      return {
        text: answer.text,
        spent: estimateOf(answer.model, answer.usage, answer.price),
        month,
      };
    },
  };
};
