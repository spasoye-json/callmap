/**
 * The trace prompt: the AI pass that reads the code of one candidate and fills in its lanes, nodes,
 * and edges (ADR-0005). It runs once per flow, the first time a reader opens it, because a trace
 * costs real tokens.
 *
 * The rules are the prototype's, kept as they were proven: read the code and never guess a line,
 * follow the flow through every layer, trace every branch, anchor a side effect where it happens,
 * and cross a process boundary only with an inferred edge that quotes its evidence. The schema they
 * are written for is the product flow document: lanes are named by the pass, an edge carries no
 * label, and evidence is a quote anchored to a file and a line the reference graph knows.
 */

import { repoMaterial } from '@archmap/discovery';
import type { DiscoveryPrompt, SourceFile } from '@archmap/discovery';
import { BOUNDARIES, NODE_KINDS } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';

/** What a provider is asked, in the one shape every pass uses. */
export type TracePrompt = DiscoveryPrompt;

export interface TracePromptInput {
  /** The flow to trace. Only its id, name, and entry point are read. */
  readonly flow: FlowDocument;
  readonly referenceGraph: ReferenceGraph;
  readonly sources: readonly SourceFile[];
}

const MAX_OUTPUT_TOKENS = 32_000;

/**
 * No source records a measured rate yet, so this is a stated guess: the flows the prototype traced
 * held about twenty nodes, which is a few thousand tokens of answer, plus room for the reasoning.
 */
const EXPECTED_OUTPUT_TOKENS = 8_000;

export const TRACE_SYSTEM = `You are the trace pass of Archmap. You read the code of one flow and write down its lanes, its nodes, and its edges. A flow is one use case traced end to end, from the entry point that starts it to the last side effect it causes. The flow is already named and anchored to its entry point. You run once per flow, because a trace costs real tokens.

## Inputs

- The flow: its id, its name, and its entry point. They are settled. You do not answer with them.
- The reference graph: every file in scope with its language, and every static reference edge between files. It is the ground truth. A file that is not in this list does not exist for you.
- The source of the files in scope. Every line starts with its line number and "| ".

## Output

Answer with one JSON object and nothing else:

{"lanes": [{"id": "web", "name": "Web app"}, {"id": "shop", "name": "Shop backend"}],
 "nodes": [{"id": "submit-order", "kind": "step", "label": "The shopper submits the cart", "lane": "web", "file": "web/src/screens/checkout.ts", "line": 3}],
 "edges": [{"kind": "verified", "from": "submit-order", "to": "post-order"},
           {"kind": "inferred", "from": "post-order", "to": "create-order", "boundary": "http", "evidence": {"quote": "post \\"/orders\\", to: \\"orders#create\\"", "file": "shop/config/routes.rb", "line": 2}}]}

- lanes: one lane per side of a process boundary the flow crosses, in the order the flow first enters them: the app a user acts in, the server that answers a request, the listeners that run when an event arrives. id is kebab-case. name is a few words a reader knows the place by. Declare no lane the flow never enters.
- nodes: one node per point in the flow. kind is one of ${NODE_KINDS.map((kind) => `"${kind}"`).join(', ')}: a step, a decision where the code branches, an error exit where the flow stops early and reports a failure, a side effect where the flow changes state outside itself. label is one short sentence in the words of the domain, not the function signature. lane is the id of the lane it runs in. file and line anchor it.
- edges: one edge per hop from one node to the next. kind is "verified" when the reference graph proves the hop and "inferred" when it crosses a process boundary. An inferred edge carries boundary, one of ${BOUNDARIES.map((boundary) => `"${boundary}"`).join(' or ')}, and evidence: the quoted text that proposes the hop, with the file and the line it stands on.

## Rules for the trace

- Read the code. Every node names a line you read in the numbered source. Never guess a line.
- Start at the entry point. Follow the flow through every layer it passes: screen, store, API client, route, controller, service, model, event, listener. Stop where the flow stops: a response the app renders, a row written, a message sent.
- Trace every branch, not only the happy path. A decision with an early exit gets an "error" node. Say the outcome of a branch in the label of the node it leads to, because an edge carries no label.
- A side effect is a row written, a message sent, or an event emitted. Anchor it at the line that causes it.
- An HTTP call is an inferred edge with boundary "http" from the node that sends the request to the node that answers it. Quote the route declaration the request matches, at its file and line. A backend error the app shows is a second inferred edge, from the "error" node to the node in the app that shows it.
- An emitted event is a "side-effect" node and an inferred edge with boundary "event" to the first node of each listener that handles it. Quote the line that subscribes the listener, so the event name is in the evidence.
- A verified edge stays inside one lane. Two nodes in one file need nothing more. Two nodes in two files need a reference edge between those files, in either direction, and the two files must have the same language. Check the reference edges before you write "verified".
- An inferred edge crosses from one lane to another. A hop inside one lane that no reference edge proves is not a hop you can claim: follow the code to a file the reference graph joins, or leave the hop out.
- Every file, in a node and in evidence, must be a file the reference graph lists, copied exactly.
- Node ids are kebab-case and unique inside the flow.
- Do not add a field the schema does not name. Unknown fields are rejected.`;

const ANSWER_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    lanes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' } },
        required: ['id', 'name'],
        additionalProperties: false,
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: [...NODE_KINDS] },
          label: { type: 'string' },
          lane: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
        },
        required: ['id', 'kind', 'label', 'lane', 'file', 'line'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['verified'] },
              from: { type: 'string' },
              to: { type: 'string' },
            },
            required: ['kind', 'from', 'to'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['inferred'] },
              from: { type: 'string' },
              to: { type: 'string' },
              boundary: { type: 'string', enum: [...BOUNDARIES] },
              evidence: {
                type: 'object',
                properties: {
                  quote: { type: 'string' },
                  file: { type: 'string' },
                  line: { type: 'integer' },
                },
                required: ['quote', 'file', 'line'],
                additionalProperties: false,
              },
            },
            required: ['kind', 'from', 'to', 'boundary', 'evidence'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ['lanes', 'nodes', 'edges'],
  additionalProperties: false,
};

/** The request a trace pass sends for one flow. */
export const tracePrompt = (input: TracePromptInput): TracePrompt => {
  const { flow } = input;
  const { kind, file, line } = flow.entryPoint;
  const header = [
    '## The flow to trace',
    `id: ${flow.id}\nname: ${flow.name}\nentry point: ${kind} at ${file}:${String(line)}`,
  ].join('\n\n');
  return {
    system: TRACE_SYSTEM,
    prompt: `${header}\n\n${repoMaterial(input)}`,
    outputSchema: ANSWER_SCHEMA,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    expectedOutputTokens: EXPECTED_OUTPUT_TOKENS,
  };
};
