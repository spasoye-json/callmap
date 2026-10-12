/**
 * The discovery prompt: the one AI pass that proposes entry points for any repo with a reference
 * graph (ADR-0010). The prototype's prompt named flows from a framework scan. The product has no
 * scanner, so the pass reads the reference graph and the numbered source of every file in scope,
 * and anchors each proposal to a file and a line itself. The validator then checks every anchor.
 *
 * The rules for choosing flows are the prototype's, kept as they were proven: one proposal per use
 * case, a listener flow for every listener, and no flow for an entry point that only renders one
 * value.
 */

import { ENTRY_POINT_KINDS } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';

/** One file of the repo as the host read it, by repo-relative path. */
export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** What a provider is asked: the same shape for every provider, so the prompt is written once. */
export interface DiscoveryPrompt {
  readonly system: string;
  readonly prompt: string;
  /** A JSON schema of the answer, for a provider that can hold its output to one. */
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  /** The output a pass of this size is expected to write, thinking included, for the estimate. */
  readonly expectedOutputTokens: number;
}

export interface DiscoveryPromptInput {
  readonly referenceGraph: ReferenceGraph;
  readonly sources: readonly SourceFile[];
}

const MAX_OUTPUT_TOKENS = 32_000;

/**
 * No source records a measured rate yet, so this is a stated guess: a fixed allowance for the
 * model's reasoning plus a share per file, since a larger scope holds more use cases to name.
 */
const BASE_OUTPUT_TOKENS = 2_000;
const OUTPUT_TOKENS_PER_FILE = 25;

export const DISCOVERY_SYSTEM = `You are the discovery pass of Archmap. You read one repo and propose the flows it contains. A flow is one use case traced end to end, from the entry point that starts it to the last side effect it causes. You name flows and anchor each one to its entry point. You do not trace them: a later pass reads the code of one flow at a time.

## Inputs

- The reference graph: every file in scope with its language, and every static reference edge between files. It is the ground truth. A file that is not in this list does not exist for you.
- The source of the files in scope. Every line starts with its line number and "| ".

## Output

Answer with one JSON object and nothing else:

{"proposedEntryPoints": [{"id": "place-an-order", "name": "A shopper places an order from the checkout screen", "entryPoint": {"kind": "screen", "file": "app/screens/checkout.tsx", "line": 12}}]}

- id: a kebab-case slug that matches ^[a-z0-9]+(-[a-z0-9]+)*$, unique across the list. It names a file, so anything else is rejected.
- name: the use case in one short sentence, actor first. Not the file name and not the handler name.
- entryPoint.kind: "route" for a server endpoint, "screen" for a screen or page a user acts on, "event-listener" for code that runs when an event, a message, or a job arrives.
- entryPoint.file: a path copied exactly from the reference graph. A proposal at any other path is rejected.
- entryPoint.line: the number of the line where the entry point is declared: the route declaration, the screen component, or the listener subscription. Read it from the numbered source. Do not guess it.

## Rules for choosing flows

- Propose one flow per use case, not one per entry point. A screen holds several use cases, so several flows may start at the same screen.
- Propose a screen flow for each use case a user starts on that screen.
- Propose a route flow when the server side is a use case in its own right: an endpoint the app never calls, an admin action, or work a reviewer would read on its own.
- Propose a flow for every event listener. A listener is a background use case with its own side effects, and it is the flow a reviewer would otherwise never see.
- Skip an entry point that reads one value and renders it. A flow that crosses no boundary and causes no side effect is noise in the flow picker.
- Assume no framework. Find entry points from what the code does: a handler registered for a path, a component a router or a navigator shows, a function subscribed to an event or a queue.
- Propose nothing outside the files of the reference graph.`;

const numbered = (text: string): string =>
  text
    .replace(/\n$/, '')
    .split('\n')
    .map((line, index) => `${String(index + 1)}| ${line}`)
    .join('\n');

const ANSWER_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    proposedEntryPoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          entryPoint: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...ENTRY_POINT_KINDS] },
              file: { type: 'string' },
              line: { type: 'integer' },
            },
            required: ['kind', 'file', 'line'],
            additionalProperties: false,
          },
        },
        required: ['id', 'name', 'entryPoint'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposedEntryPoints'],
  additionalProperties: false,
};

/** The request a discovery pass sends for one repo under one scope. */
export const discoveryPrompt = (input: DiscoveryPromptInput): DiscoveryPrompt => {
  const { referenceGraph } = input;
  const files = referenceGraph.files.map((file) => `${file.path} (${file.language})`);
  const edges = referenceGraph.edges.map((edge) => `${edge.from} -> ${edge.to}`);
  const known = new Set(referenceGraph.files.map((file) => file.path));
  const sources = input.sources
    .filter((source) => known.has(source.path))
    .map((source) => `=== ${source.path}\n${numbered(source.text)}`);
  const prompt = [
    '## Files in scope',
    files.join('\n'),
    '## Reference edges',
    edges.length === 0 ? '(none)' : edges.join('\n'),
    '## Source',
    sources.join('\n\n'),
  ].join('\n\n');
  return {
    system: DISCOVERY_SYSTEM,
    prompt,
    outputSchema: ANSWER_SCHEMA,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    expectedOutputTokens: Math.min(
      MAX_OUTPUT_TOKENS,
      BASE_OUTPUT_TOKENS + OUTPUT_TOKENS_PER_FILE * referenceGraph.files.length,
    ),
  };
};
