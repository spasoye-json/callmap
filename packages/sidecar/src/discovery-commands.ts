/**
 * The commands behind discovery, curation, cost, and the map file. The pure rules live in
 * `@archmap/discovery`. This module does what they cannot: it reads source files, calls the
 * provider, keeps the key and the spend in the local store, and writes the map file.
 */

import {
  curate,
  CurationError,
  DiscoveryError,
  discoveryPrompt,
  estimateOf,
  pendingProposals,
  readDiscoveryAnswer,
} from '@archmap/discovery';
import type { ProposedEntryPoint } from '@archmap/discovery';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { marksOf } from './anchors.ts';
import { writeCuration, writeFlowDocument } from './map-file.ts';
import { aiRequestOf, createAiAccount, graphOf, mapOf, sourcesOf, withProvider } from './passes.ts';
import type { AiOptions, Command } from './passes.ts';
import { Refusal, requireRepo, requireString } from './requests.ts';
import type {
  AccountResult,
  DiscoverResult,
  EstimateResult,
  MapResult,
} from './discovery-protocol.ts';

export type { AiOptions } from './passes.ts';

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

const mapResultOf = (repo: string, graph: ReferenceGraph): MapResult => {
  const map = mapOf(repo, graph);
  return {
    flows: map.flows,
    refused: map.refused,
    curation: map.curation,
    marks: marksOf(repo, map),
  };
};

export const createDiscoveryCommands = (options: AiOptions = {}): ReadonlyMap<string, Command> => {
  const ai = createAiAccount(options);

  const discoveryRequest = (repo: string, graph: ReferenceGraph) => {
    const prompt = discoveryPrompt({ referenceGraph: graph, sources: sourcesOf(repo, graph) });
    return { request: aiRequestOf(prompt), expectedOutputTokens: prompt.expectedOutputTokens };
  };

  const map = (request: Record<string, unknown>): Promise<MapResult> => {
    const repo = requireRepo(request);
    return Promise.resolve(mapResultOf(repo, graphOf(request)));
  };

  const estimateDiscovery = async (request: Record<string, unknown>): Promise<EstimateResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const provider = ai.provider();
    const { request: aiRequest, expectedOutputTokens } = discoveryRequest(repo, graph);
    const inputTokens = await withProvider(() => provider.countInputTokens(aiRequest));
    return {
      estimate: estimateOf(
        provider.model,
        { inputTokens, outputTokens: expectedOutputTokens },
        provider.price,
      ),
      month: ai.thisMonth(),
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
    const provider = ai.provider();
    const answer = await withProvider(() =>
      provider.complete(discoveryRequest(repo, graph).request),
    );
    const month = ai.recordSpend(answer.usage, provider);
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
      spent: estimateOf(provider.model, answer.usage, provider.price),
      month,
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
    return Promise.resolve(mapResultOf(repo, graph));
  };

  const account = (): Promise<AccountResult> =>
    Promise.resolve({ keyStored: ai.storedKey() !== null, month: ai.thisMonth() });

  const setKey = (request: Record<string, unknown>): Promise<AccountResult> => {
    ai.storeKey(requireString(request, 'key'));
    return account();
  };

  return new Map<string, Command>([
    ['map', map],
    ['estimate-discovery', estimateDiscovery],
    ['discover', discover],
    ['curate', curateCommand],
    ['account', account],
    ['set-key', setKey],
  ]);
};
