/**
 * The trace pass as data (ADR-0005): the prompt that asks for one flow's nodes and edges, and the
 * reader that lays the answer into the flow and holds it to the validator. Nothing here reads a
 * file or calls a provider.
 */

export { readTraceAnswer, TRACE_ANSWER_FIELDS } from './answer.ts';
export type { ReadTraceOptions, TraceReading, TraceRefusal, TraceRefusalCode } from './answer.ts';
export { TRACE_SYSTEM, tracePrompt } from './prompt.ts';
export type { TracePrompt, TracePromptInput } from './prompt.ts';
