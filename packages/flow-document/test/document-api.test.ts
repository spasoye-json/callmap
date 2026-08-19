import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, fixtureReferenceGraph } from '@archmap/testing';
import {
  assertFlowDocument,
  BOUNDARIES,
  EDGE_KINDS,
  ENTRY_POINT_KINDS,
  FLOW_DOCUMENT_FIELDS,
  FlowDocumentError,
  isCandidate,
  isInferredEdge,
  isTracedFlow,
  isVerifiedEdge,
  NODE_KINDS,
  parseFlowDocument,
} from '../src/index.ts';
import { codesOf, errorsOf } from './support.ts';

const options = { referenceGraph: fixtureReferenceGraph() };

describe('parseFlowDocument', () => {
  it('accepts the JSON text of a traced flow', () => {
    const result = parseFlowDocument(JSON.stringify(checkoutFlow()), options);
    expect(result.ok).toBe(true);
  });

  it('reads a document back unchanged through JSON', () => {
    const result = parseFlowDocument(JSON.stringify(checkoutFlow()), options);
    expect(result.ok && result.document).toEqual(checkoutFlow());
  });

  it('rejects text that is not JSON, rather than throwing', () => {
    const result = parseFlowDocument('{ not json', options);
    expect(codesOf(result)).toEqual(['invalid-json']);
  });

  it('rejects JSON that is not a flow document', () => {
    const result = parseFlowDocument('[]', options);
    expect(codesOf(result)).toEqual(['not-an-object']);
  });

  it('rejects empty text, which is what a half-written document reads as', () => {
    const result = parseFlowDocument('', options);
    expect(codesOf(result)).toEqual(['invalid-json']);
  });

  it('rejects text holding nothing but whitespace', () => {
    const result = parseFlowDocument('  \n  ', options);
    expect(codesOf(result)).toEqual(['invalid-json']);
  });

  it('rejects a document truncated part way through', () => {
    const text = JSON.stringify(checkoutFlow());
    const result = parseFlowDocument(text.slice(0, Math.floor(text.length / 2)), options);
    expect(codesOf(result)).toEqual(['invalid-json']);
  });

  it('says why the text is not JSON, so a reader can find the break', () => {
    const result = parseFlowDocument('{ not json', options);
    expect(errorsOf(result)[0]?.message).toMatch(/^the flow document is not valid JSON: ./);
  });

  it('rejects JSON of null', () => {
    const result = parseFlowDocument('null', options);
    expect(codesOf(result)).toEqual(['not-an-object']);
  });

  it('rejects JSON of a bare string', () => {
    const result = parseFlowDocument('"place-an-order"', options);
    expect(codesOf(result)).toEqual(['not-an-object']);
  });

  it('reads a candidate back unchanged through JSON', () => {
    const result = parseFlowDocument(JSON.stringify(candidate()), options);
    expect(result.ok && result.document).toEqual(candidate());
  });
});

describe('assertFlowDocument', () => {
  it('returns the document it accepted', () => {
    expect(assertFlowDocument(checkoutFlow(), options).id).toBe('checkout');
  });

  it('throws a FlowDocumentError when the document is refused', () => {
    expect(() => assertFlowDocument({}, options)).toThrow(FlowDocumentError);
  });

  it('carries every refusal on the error', () => {
    try {
      assertFlowDocument({}, options);
      expect.unreachable('a bare object is not a flow document');
    } catch (error) {
      expect(error).toBeInstanceOf(FlowDocumentError);
      expect((error as FlowDocumentError).errors.length).toBeGreaterThan(0);
    }
  });

  it('names the refused field in the message', () => {
    expect(() => assertFlowDocument({ ...checkoutFlow(), id: '' }, options)).toThrow(/id/);
  });
});

describe('isCandidate and isTracedFlow', () => {
  it('reads a flow with no nodes as a candidate', () => {
    expect(isCandidate(candidate())).toBe(true);
  });

  it('does not read a candidate as traced', () => {
    expect(isTracedFlow(candidate())).toBe(false);
  });

  it('reads a flow with nodes as traced', () => {
    expect(isTracedFlow(checkoutFlow())).toBe(true);
  });

  it('does not read a traced flow as a candidate', () => {
    expect(isCandidate(checkoutFlow())).toBe(false);
  });
});

describe('the edge guards', () => {
  const flow = checkoutFlow();

  it('narrows a verified edge', () => {
    expect(flow.edges.filter(isVerifiedEdge)).toHaveLength(5);
  });

  it('narrows an inferred edge', () => {
    expect(flow.edges.filter(isInferredEdge)).toHaveLength(2);
  });

  it('reads the evidence off a narrowed inferred edge', () => {
    const [first] = flow.edges.filter(isInferredEdge);
    expect(first?.evidence.quote).toContain('/orders');
  });
});

describe('the format constants', () => {
  it('names the six fields of the document', () => {
    expect([...FLOW_DOCUMENT_FIELDS].sort()).toEqual([
      'edges',
      'entryPoint',
      'id',
      'lanes',
      'name',
      'nodes',
    ]);
  });

  it('names the four node kinds, with the error exit written as error', () => {
    expect(NODE_KINDS).toEqual(['step', 'decision', 'error', 'side-effect']);
  });

  it('names the three entry point kinds', () => {
    expect(ENTRY_POINT_KINDS).toEqual(['route', 'screen', 'event-listener']);
  });

  it('names the two boundaries', () => {
    expect(BOUNDARIES).toEqual(['http', 'event']);
  });

  it('names the two edge classes', () => {
    expect(EDGE_KINDS).toEqual(['verified', 'inferred']);
  });
});
