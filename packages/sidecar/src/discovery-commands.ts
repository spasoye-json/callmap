/**
 * The commands behind discovery, curation, cost, and the map file. The pure rules live in
 * `@archmap/discovery`. This module does what they cannot: it reads source files, calls the
 * provider, keeps the key and the spend in the local store, and writes the map file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addSpend,
  curate,
  CurationError,
  DiscoveryError,
  discoveryPrompt,
  estimateOf,
  monthOf,
  pendingProposals,
  readDiscoveryAnswer,
  spendIn,
} from '@archmap/discovery';
import type { ProposedEntryPoint, SourceFile } from '@archmap/discovery';
import { ReferenceGraphError, referenceGraphFromDocuments } from '@archmap/reference-graph';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { createLocalStore, defaultConfigDir } from './local-store.ts';
import { readMapFile, writeCuration, writeFlowDocument } from './map-file.ts';
import type { MapFile } from './map-file.ts';
import { ProviderFailure } from './provider.ts';
import type { AiProvider, AiRequest } from './provider.ts';
import { Refusal, requireDocuments, requireRepo, requireString } from './requests.ts';
import type {
  AccountResult,
  DiscoverResult,
  EstimateResult,
  MapResult,
} from './discovery-protocol.ts';

export interface AiOptions {
  /** Where the key and the monthly spend live. Never inside a repo. */
  readonly configDir?: string;
  /** The provider a stored key opens. Anthropic, unless a test hands in a fake. */
  readonly providerFor?: (key: string) => AiProvider;
  readonly now?: () => Date;
}

export type DiscoveryCommand = (request: Record<string, unknown>) => Promise<unknown>;

const graphOf = (request: Record<string, unknown>): ReferenceGraph => {
  try {
    return referenceGraphFromDocuments(...requireDocuments(request));
  } catch (error) {
    if (error instanceof ReferenceGraphError) throw new Refusal('graph-refused', error.message);
    throw error;
  }
};

/** The source of every file the graph knows, read from the repo as it stands now. */
const sourcesOf = (repo: string, graph: ReferenceGraph): readonly SourceFile[] =>
  graph.files.map((file) => ({
    path: file.path,
    text: readFileSync(join(repo, file.path), 'utf8'),
  }));

const mapOf = (repo: string, graph: ReferenceGraph): MapFile => {
  try {
    return readMapFile(repo, graph);
  } catch (error) {
    if (error instanceof CurationError) throw new Refusal('map-file-refused', error.message);
    throw error;
  }
};

const requireProposals = (
  request: Record<string, unknown>,
  field: string,
): readonly ProposedEntryPoint[] => {
  const value = request[field];
  if (!Array.isArray(value)) {
    throw new Refusal('malformed-request', `'${field}' must be a list of proposed entry points`);
  }
  return value as readonly ProposedEntryPoint[];
};

const withProvider = async <Result>(run: () => Promise<Result>): Promise<Result> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderFailure) throw new Refusal('provider-failed', error.message);
    throw error;
  }
};

export const createDiscoveryCommands = (
  options: AiOptions = {},
): ReadonlyMap<string, DiscoveryCommand> => {
  const store = createLocalStore(options.configDir ?? defaultConfigDir());
  const providerFor =
    options.providerFor ?? ((apiKey: string) => createAnthropicProvider({ apiKey }));
  const now = options.now ?? (() => new Date());
  const thisMonth = () => spendIn(store.readSpend(), monthOf(now()));

  const provider = (): AiProvider => {
    const key = store.readKey();
    if (key === null) {
      throw new Refusal('no-api-key', 'store an AI provider key before a pass that costs tokens');
    }
    return providerFor(key);
  };

  const discoveryRequest = (repo: string, graph: ReferenceGraph) => {
    const prompt = discoveryPrompt({ referenceGraph: graph, sources: sourcesOf(repo, graph) });
    const request: AiRequest = {
      system: prompt.system,
      prompt: prompt.prompt,
      outputSchema: prompt.outputSchema,
      maxOutputTokens: prompt.maxOutputTokens,
    };
    return { request, expectedOutputTokens: prompt.expectedOutputTokens };
  };

  const map = (request: Record<string, unknown>): Promise<MapResult> => {
    const repo = requireRepo(request);
    return Promise.resolve(mapOf(repo, graphOf(request)));
  };

  const estimateDiscovery = async (request: Record<string, unknown>): Promise<EstimateResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const ai = provider();
    const { request: aiRequest, expectedOutputTokens } = discoveryRequest(repo, graph);
    const inputTokens = await withProvider(() => ai.countInputTokens(aiRequest));
    return {
      estimate: estimateOf(ai.model, { inputTokens, outputTokens: expectedOutputTokens }, ai.price),
      month: thisMonth(),
    };
  };

  /**
   * The spend is recorded before the answer is read: the tokens are spent whether or not the
   * answer can be read, and the monthly total must not hide a failed pass.
   */
  const discover = async (request: Record<string, unknown>): Promise<DiscoverResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const curated = mapOf(repo, graph);
    const ai = provider();
    const answer = await withProvider(() => ai.complete(discoveryRequest(repo, graph).request));
    const month = monthOf(now());
    store.writeSpend(addSpend(store.readSpend(), month, answer.usage, ai.price));
    let reading;
    try {
      reading = readDiscoveryAnswer(answer.text, { referenceGraph: graph });
    } catch (error) {
      if (error instanceof DiscoveryError) throw new Refusal('provider-failed', error.message);
      throw error;
    }
    const { pending, alreadyCurated } = pendingProposals(reading.proposals, curated);
    return {
      proposals: pending,
      rejections: reading.rejections,
      alreadyCurated,
      spent: estimateOf(ai.model, answer.usage, ai.price),
      month: spendIn(store.readSpend(), month),
    };
  };

  const curateCommand = (request: Record<string, unknown>): Promise<MapResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const accept = requireProposals(request, 'accept');
    const reject = requireProposals(request, 'reject');
    let round;
    try {
      round = curate({ accept, reject }, mapOf(repo, graph), { referenceGraph: graph });
    } catch (error) {
      if (error instanceof CurationError) {
        throw new Refusal(
          error.code === 'already-curated' ? 'already-curated' : 'proposal-refused',
          error.message,
        );
      }
      throw error;
    }
    for (const candidate of round.candidates) writeFlowDocument(repo, candidate);
    if (reject.length > 0) writeCuration(repo, round.curation);
    return Promise.resolve(mapOf(repo, graph));
  };

  const account = (): Promise<AccountResult> =>
    Promise.resolve({ keyStored: store.readKey() !== null, month: thisMonth() });

  const setKey = (request: Record<string, unknown>): Promise<AccountResult> => {
    store.writeKey(requireString(request, 'key'));
    return account();
  };

  return new Map<string, DiscoveryCommand>([
    ['map', map],
    ['estimate-discovery', estimateDiscovery],
    ['discover', discover],
    ['curate', curateCommand],
    ['account', account],
    ['set-key', setKey],
  ]);
};
