import { describe, expect, it } from 'vitest';
import { checkoutFlow, clone, fixtureReferenceGraph } from '@archmap/testing';
import type { FlowDocument } from '@archmap/flow-document';
import { readTraceAnswer } from '../src/index.ts';

const referenceGraph = fixtureReferenceGraph();

const traced = checkoutFlow();

const candidateOf = (flow: FlowDocument): FlowDocument => ({
  ...flow,
  lanes: [],
  nodes: [],
  edges: [],
});

const flow = candidateOf(traced);

const answerOf = (value: unknown): string => JSON.stringify(value);

const tracedPart = (document: FlowDocument) => ({
  lanes: document.lanes,
  nodes: document.nodes,
  edges: document.edges,
});

const codesOf = (text: string): readonly string[] => {
  const reading = readTraceAnswer(text, { flow, referenceGraph });
  return reading.ok ? [] : reading.errors.map((error) => error.code);
};

describe('reading a trace answer', () => {
  it('fills the candidate with the lanes, nodes, and edges the trace read', () => {
    const reading = readTraceAnswer(answerOf(tracedPart(traced)), { flow, referenceGraph });
    expect(reading).toEqual({ ok: true, document: traced });
  });

  it('keeps the id, name, and entry point of the candidate', () => {
    const reading = readTraceAnswer(answerOf(tracedPart(traced)), {
      flow: { ...flow, name: 'Place an order, as the reader curated it' },
      referenceGraph,
    });
    expect(reading.ok && reading.document.name).toBe('Place an order, as the reader curated it');
  });
});

describe('a trace answer the reader refuses', () => {
  it('refuses an answer that is not JSON', () => {
    expect(codesOf('the flow starts at the checkout screen')).toEqual(['unreadable-answer']);
  });

  it('refuses an answer that is not an object', () => {
    expect(codesOf('[]')).toEqual(['unreadable-answer']);
  });

  it('refuses an answer that tries to rename the flow, because curation settled the name', () => {
    expect(codesOf(answerOf({ ...tracedPart(traced), name: 'Something else' }))).toEqual([
      'unknown-field',
    ]);
  });

  it('refuses an answer with no nodes, because it would leave the flow a candidate', () => {
    expect(codesOf(answerOf({ lanes: [], nodes: [], edges: [] }))).toEqual(['empty-trace']);
  });

  it('refuses a node in a file the reference graph does not know', () => {
    const invented = clone(tracedPart(traced));
    const first = invented.nodes[0];
    if (first === undefined) throw new Error('the fixture flow has no nodes');
    invented.nodes = [{ ...first, file: 'app/screens/invented.tsx' }, ...invented.nodes.slice(1)];
    expect(codesOf(answerOf(invented))).toContain('unknown-file');
  });

  it('refuses a verified edge across lanes, because a boundary is never proven', () => {
    const unproven = clone(tracedPart(traced));
    unproven.edges = [
      ...unproven.edges,
      { kind: 'verified', from: 'tap-checkout', to: 'send-receipt' },
    ];
    expect(codesOf(answerOf(unproven))).toContain('boundary-edge-claims-verified');
  });
});
