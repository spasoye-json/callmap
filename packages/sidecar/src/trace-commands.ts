/**
 * The commands behind the lazy trace (ADR-0005). The pure rules live in `@archmap/trace`. This
 * module reads the source, calls the provider, records the spend, and saves the traced flow over
 * its candidate in the map file, so reopening it reads the file and calls no provider.
 */

import { isTracedFlow } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { readTraceAnswer, tracePrompt } from '@archmap/trace';
import type { TraceRefusal } from '@archmap/trace';
import { stampTracedFlow } from './anchors.ts';
import { writeFlowDocument } from './map-file.ts';
import { createAiAccount, graphOf, mapOf, passRequestOf, sourcesOf } from './passes.ts';
import type { AiOptions, Command } from './passes.ts';
import { Refusal, requireRepo, requireString } from './requests.ts';
import type { EstimateResult } from './cost-protocol.ts';
import type { TraceResult } from './trace-protocol.ts';

/**
 * The candidate a request names. A traced flow is refused: its trace is already paid for and
 * saved, and replacing it is a decision the reader makes, not a side effect of opening it.
 */
const candidateNamed = (repo: string, graph: ReferenceGraph, flowId: string): FlowDocument => {
  const flow = mapOf(repo, graph).flows.find((candidate) => candidate.id === flowId);
  if (flow === undefined) {
    throw new Refusal(
      'unknown-flow',
      `the map file holds no flow '${flowId}' that the validator accepts`,
    );
  }
  if (isTracedFlow(flow)) {
    throw new Refusal('already-traced', `the flow '${flowId}' is traced already and saved`);
  }
  return flow;
};

const describeRefusals = (errors: readonly TraceRefusal[]): string =>
  errors
    .map((error) => `${error.path === '' ? 'answer' : error.path}: ${error.code}, ${error.message}`)
    .join('; ');

/**
 * Save the traced flow over its candidate, then stamp it. Everything a trace leaves in the map
 * file is written here. The flow is written first, so a stamp that fails leaves a flow that reads
 * as unstamped, never a stamp over a candidate.
 */
const saveTracedFlow = (repo: string, graph: ReferenceGraph, flow: FlowDocument): void => {
  writeFlowDocument(repo, flow);
  stampTracedFlow(repo, mapOf(repo, graph), flow);
};

export const createTraceCommands = (options: AiOptions = {}): ReadonlyMap<string, Command> => {
  const ai = createAiAccount(options);

  const tracePass = (repo: string, graph: ReferenceGraph, flow: FlowDocument) => () =>
    passRequestOf(tracePrompt({ flow, referenceGraph: graph, sources: sourcesOf(repo, graph) }));

  const estimateTrace = (request: Record<string, unknown>): Promise<EstimateResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const flow = candidateNamed(repo, graph, requireString(request, 'flowId'));
    return ai.estimate(tracePass(repo, graph, flow));
  };

  const trace = async (request: Record<string, unknown>): Promise<TraceResult> => {
    const repo = requireRepo(request);
    const graph = graphOf(request);
    const flow = candidateNamed(repo, graph, requireString(request, 'flowId'));
    const answer = await ai.run(tracePass(repo, graph, flow));
    const reading = readTraceAnswer(answer.text, { flow, referenceGraph: graph });
    if (!reading.ok) {
      throw new Refusal(
        'trace-refused',
        `the trace of '${flow.id}' was refused: ${describeRefusals(reading.errors)}`,
      );
    }
    saveTracedFlow(repo, graph, reading.document);
    return { flow: reading.document, spent: answer.spent, month: answer.month };
  };

  return new Map<string, Command>([
    ['estimate-trace', estimateTrace],
    ['trace', trace],
  ]);
};
