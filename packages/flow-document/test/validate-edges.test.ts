import { describe, expect, it } from 'vitest';
import {
  BACKEND_LANE,
  checkoutFlow,
  clone,
  CONTROLLER_FILE,
  inferredEdge,
  JOB_FILE,
  MOBILE_LANE,
  MODEL_FILE,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
  UNREFERENCED_FILE,
  verifiedEdge,
} from '@archmap/testing';
import { errorsOf, expectAccepted, expectRefusal, validate } from './support.ts';

interface Anchor {
  readonly lane: string;
  readonly file: string;
}

/** Two nodes and one edge: the smallest document that exercises one edge rule. */
const pairFlow = (source: Anchor, target: Anchor, edge: unknown): unknown => ({
  id: 'pair',
  name: 'One hop',
  entryPoint: { kind: 'route', file: source.file, line: 1 },
  lanes: [
    { id: MOBILE_LANE, name: 'Mobile app' },
    { id: BACKEND_LANE, name: 'Backend request' },
  ],
  nodes: [
    { id: 'a', kind: 'step', label: 'First', lane: source.lane, file: source.file, line: 3 },
    { id: 'b', kind: 'step', label: 'Second', lane: target.lane, file: target.file, line: 4 },
  ],
  edges: [edge],
});

const mobile = (file: string): Anchor => ({ lane: MOBILE_LANE, file });
const backend = (file: string): Anchor => ({ lane: BACKEND_LANE, file });

const httpEvidence = { quote: "post '/orders'", file: CONTROLLER_FILE, line: 13 };

describe('a verified edge', () => {
  it('is accepted when both nodes sit in one file', () => {
    expectAccepted(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), verifiedEdge('a', 'b')),
    );
  });

  it('is accepted across a pair of files the reference graph joins', () => {
    expectAccepted(
      pairFlow(mobile(SCREEN_FILE), mobile(ORDERS_CLIENT_FILE), verifiedEdge('a', 'b')),
    );
  });

  it('is accepted against the direction of the reference, because a callback inverts it', () => {
    expectAccepted(
      pairFlow(mobile(ORDERS_CLIENT_FILE), mobile(SCREEN_FILE), verifiedEdge('a', 'b')),
    );
  });

  it('is rejected when the reference graph does not prove the pair', () => {
    expectRefusal(
      pairFlow(backend(MODEL_FILE), backend(UNREFERENCED_FILE), verifiedEdge('a', 'b')),
      'unproven-verified-edge',
      'edges[0]',
    );
  });

  it('names both files when the reference graph does not prove the pair', () => {
    const result = validate(
      pairFlow(backend(MODEL_FILE), backend(UNREFERENCED_FILE), verifiedEdge('a', 'b')),
    );
    const [refusal] = errorsOf(result);
    expect(refusal?.message).toContain(MODEL_FILE);
    expect(refusal?.message).toContain(UNREFERENCED_FILE);
  });

  it('is rejected when the two files belong to two languages', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(ORDERS_CLIENT_FILE), verifiedEdge('a', 'b')),
      'verified-edge-crosses-language',
      'edges[0].kind',
    );
  });

  it('is rejected when it crosses a lane, because that is a process boundary', () => {
    expectRefusal(
      pairFlow(mobile(ORDERS_CLIENT_FILE), backend(CONTROLLER_FILE), verifiedEdge('a', 'b')),
      'boundary-edge-claims-verified',
      'edges[0].kind',
    );
  });

  it('cannot replace the HTTP hop of the traced flow', () => {
    const flow = clone(checkoutFlow());
    const edges = flow.edges.map((edge) =>
      edge.from === 'post-order' ? verifiedEdge('post-order', 'receive-order') : edge,
    );
    expectRefusal({ ...flow, edges }, 'boundary-edge-claims-verified');
  });

  it('cannot replace the event hop of the traced flow', () => {
    const flow = clone(checkoutFlow());
    const edges = flow.edges.map((edge) =>
      edge.from === 'emit-order-placed' ? verifiedEdge('emit-order-placed', 'send-receipt') : edge,
    );
    expectRefusal({ ...flow, edges }, 'boundary-edge-claims-verified');
  });

  it('is rejected when it carries evidence, because a proven edge needs none', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), {
        kind: 'verified',
        from: 'a',
        to: 'b',
        evidence: httpEvidence,
      }),
      'unknown-field',
      'edges[0].evidence',
    );
  });

  it('is rejected when it claims a boundary', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), {
        kind: 'verified',
        from: 'a',
        to: 'b',
        boundary: 'http',
      }),
      'unknown-field',
      'edges[0].boundary',
    );
  });
});

describe('an inferred edge', () => {
  const boundaryEdge = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
    kind: 'inferred',
    from: 'a',
    to: 'b',
    boundary: 'http',
    evidence: httpEvidence,
    ...patch,
  });

  const crossLane = (edge: unknown): unknown =>
    pairFlow(mobile(ORDERS_CLIENT_FILE), backend(CONTROLLER_FILE), edge);

  it('is accepted across a process boundary with evidence', () => {
    expectAccepted(crossLane(boundaryEdge()));
  });

  it('is accepted across two languages, because a boundary edge may cross one', () => {
    expectAccepted(crossLane(boundaryEdge()));
  });

  it('is accepted with an HTTP boundary', () => {
    expectAccepted(crossLane(boundaryEdge({ boundary: 'http' })));
  });

  it('is accepted with an event boundary', () => {
    expectAccepted(
      crossLane(
        boundaryEdge({
          boundary: 'event',
          evidence: { quote: "subscribe_to 'order.placed'", file: JOB_FILE, line: 4 },
        }),
      ),
    );
  });

  it('is rejected without evidence, so the cheap way to fake a link is closed', () => {
    const { evidence: _evidence, ...rest } = boundaryEdge();
    expectRefusal(crossLane(rest), 'missing-evidence', 'edges[0].evidence');
  });

  it('is rejected when the quote is empty', () => {
    expectRefusal(
      crossLane(boundaryEdge({ evidence: { quote: '   ', file: CONTROLLER_FILE, line: 13 } })),
      'missing-evidence',
      'edges[0].evidence.quote',
    );
  });

  it('is rejected when the quote is missing', () => {
    expectRefusal(
      crossLane(boundaryEdge({ evidence: { file: CONTROLLER_FILE, line: 13 } })),
      'missing-evidence',
      'edges[0].evidence.quote',
    );
  });

  it('is rejected when the quote is not a string', () => {
    expectRefusal(
      crossLane(boundaryEdge({ evidence: { quote: 200, file: CONTROLLER_FILE, line: 13 } })),
      'wrong-type',
      'edges[0].evidence.quote',
    );
  });

  it('is rejected when the evidence is not an object', () => {
    expectRefusal(crossLane(boundaryEdge({ evidence: 'post /orders' })), 'wrong-type');
  });

  it('is rejected when the evidence names no file', () => {
    expectRefusal(
      crossLane(boundaryEdge({ evidence: { quote: 'post', line: 13 } })),
      'missing-field',
      'edges[0].evidence.file',
    );
  });

  it('is rejected when the evidence was read from a file the reference graph does not know', () => {
    expectRefusal(
      crossLane(
        boundaryEdge({ evidence: { quote: 'post', file: 'config/invented.rb', line: 13 } }),
      ),
      'unknown-file',
      'edges[0].evidence.file',
    );
  });

  it('is rejected when the evidence names no line', () => {
    expectRefusal(
      crossLane(boundaryEdge({ evidence: { quote: 'post', file: CONTROLLER_FILE } })),
      'missing-field',
      'edges[0].evidence.line',
    );
  });

  it('is rejected when the evidence carries an unknown field', () => {
    expectRefusal(
      crossLane(
        boundaryEdge({
          evidence: { quote: 'post', file: CONTROLLER_FILE, line: 13, score: 0.8 },
        }),
      ),
      'unknown-field',
      'edges[0].evidence.score',
    );
  });

  it('is rejected without a boundary', () => {
    const { boundary: _boundary, ...rest } = boundaryEdge();
    expectRefusal(crossLane(rest), 'missing-field', 'edges[0].boundary');
  });

  it('is rejected with a boundary outside the two kinds', () => {
    expectRefusal(
      crossLane(boundaryEdge({ boundary: 'queue' })),
      'unknown-boundary',
      'edges[0].boundary',
    );
  });

  it('is rejected inside one lane, because there is no process boundary to cross', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(MODEL_FILE), boundaryEdge()),
      'inferred-edge-within-lane',
      'edges[0].kind',
    );
  });

  it('is rejected inside one lane even when the two files hold no reference edge', () => {
    expectRefusal(
      pairFlow(backend(MODEL_FILE), backend(UNREFERENCED_FILE), boundaryEdge()),
      'inferred-edge-within-lane',
    );
  });
});

describe('every edge', () => {
  it('is rejected without a kind', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), { from: 'a', to: 'b' }),
      'missing-field',
      'edges[0].kind',
    );
  });

  it('is rejected with a kind outside the two classes', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), {
        kind: 'probable',
        from: 'a',
        to: 'b',
      }),
      'unknown-kind',
      'edges[0].kind',
    );
  });

  it('is rejected with an unknown field', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), {
        kind: 'verified',
        from: 'a',
        to: 'b',
        label: 'then',
      }),
      'unknown-field',
      'edges[0].label',
    );
  });

  it('is rejected when it starts at a node the document does not declare', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), verifiedEdge('ghost', 'b')),
      'unknown-node',
      'edges[0].from',
    );
  });

  it('is rejected when it ends at a node the document does not declare', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), verifiedEdge('a', 'ghost')),
      'unknown-node',
      'edges[0].to',
    );
  });

  it('is rejected when it runs from a node to itself', () => {
    expectRefusal(
      pairFlow(backend(CONTROLLER_FILE), backend(CONTROLLER_FILE), verifiedEdge('a', 'a')),
      'self-edge',
      'edges[0]',
    );
  });

  it('is rejected when another edge already runs the same way', () => {
    const flow = clone(checkoutFlow());
    expectRefusal(
      { ...flow, edges: [...flow.edges, verifiedEdge('receive-order', 'check-cart')] },
      'duplicate-edge',
      `edges[${flow.edges.length}]`,
    );
  });

  it('may run back the other way, so a retry loop is allowed', () => {
    const flow = clone(checkoutFlow());
    expectAccepted({
      ...flow,
      edges: [...flow.edges, verifiedEdge('check-cart', 'receive-order')],
    });
  });

  it('is reported at its own position when several are wrong', () => {
    const flow = clone(checkoutFlow());
    const edges = [
      verifiedEdge('tap-checkout', 'post-order'),
      verifiedEdge('post-order', 'receive-order'),
      inferredEdge('receive-order', 'check-cart', 'http', httpEvidence),
    ];
    const paths = errorsOf(validate({ ...flow, edges })).map((error) => error.path);
    expect(paths).toContain('edges[1].kind');
    expect(paths).toContain('edges[2].kind');
  });
});
