/**
 * Reading what a trace pass answers (ADR-0001, ADR-0003, ADR-0005). The pass answers with the
 * lanes, nodes, and edges it read, and nothing else: the id, the name, and the entry point were
 * settled when a person curated the candidate, so the answer cannot carry them and the flow keeps
 * its identity across the trace. The answer is laid into the flow and the whole document crosses
 * the validator, so a trace is held to the same rules as every other producer of a flow document.
 */

import { validateFlowDocument } from '@archmap/flow-document';
import type { FlowDocument, ValidationCode } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';

/** The only fields a trace answer may hold. */
export const TRACE_ANSWER_FIELDS: readonly string[] = ['lanes', 'nodes', 'edges'];

export type TraceRefusalCode = ValidationCode | 'unreadable-answer' | 'empty-trace';

export interface TraceRefusal {
  readonly path: string;
  readonly code: TraceRefusalCode;
  readonly message: string;
}

export type TraceReading =
  | { readonly ok: true; readonly document: FlowDocument }
  | { readonly ok: false; readonly errors: readonly TraceRefusal[] };

export interface ReadTraceOptions {
  /** The flow the pass traced. Its id, name, and entry point are kept exactly. */
  readonly flow: FlowDocument;
  readonly referenceGraph: ReferenceGraph;
}

const refused = (path: string, code: TraceRefusalCode, message: string): TraceReading => ({
  ok: false,
  errors: [{ path, code, message }],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readTraceAnswer = (text: string, options: ReadTraceOptions): TraceReading => {
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return refused('', 'unreadable-answer', `the trace answer is not JSON: ${reason}`);
  }
  if (!isRecord(answer)) {
    return refused('', 'unreadable-answer', 'the trace answer must be one JSON object');
  }
  const unknown = Object.keys(answer).filter((field) => !TRACE_ANSWER_FIELDS.includes(field));
  if (unknown.length > 0) {
    return {
      ok: false,
      errors: unknown.map((field) => ({
        path: field,
        code: 'unknown-field',
        message: `a trace answers with lanes, nodes, and edges only, and '${field}' is none of them`,
      })),
    };
  }
  const { flow, referenceGraph } = options;
  const result = validateFlowDocument(
    {
      id: flow.id,
      name: flow.name,
      entryPoint: flow.entryPoint,
      lanes: answer['lanes'],
      nodes: answer['nodes'],
      edges: answer['edges'],
    },
    { referenceGraph },
  );
  if (!result.ok) return result;
  if (result.document.nodes.length === 0) {
    return refused(
      'nodes',
      'empty-trace',
      'the trace found no nodes, so the flow would still read as a candidate',
    );
  }
  return result;
};
