import { describe, expect, it } from 'vitest';
import {
  BACKEND_LANE,
  candidate,
  checkoutFlow,
  clone,
  SCREEN_FILE,
  verifiedEdge,
} from '@archmap/testing';
import { codesOf, errorsOf, expectAccepted, expectRefusal, validate } from './support.ts';

describe('a well formed flow document', () => {
  it('accepts the traced cross-language flow', () => {
    expectAccepted(checkoutFlow());
  });

  it('accepts a candidate with no nodes and no edges', () => {
    expectAccepted(candidate());
  });

  it('returns the document it accepted', () => {
    const result = validate(checkoutFlow());
    expect(result.ok && result.document.id).toBe('checkout');
  });

  it('returns the document with exactly the fields of the format', () => {
    const result = validate(checkoutFlow());
    expect(result.ok && Object.keys(result.document).sort()).toEqual([
      'edges',
      'entryPoint',
      'id',
      'lanes',
      'name',
      'nodes',
    ]);
  });

  it('reports no errors when it accepts', () => {
    expect(errorsOf(validate(checkoutFlow()))).toEqual([]);
  });

  it('accepts a traced flow that carries nodes but no edges yet', () => {
    const flow = clone(checkoutFlow());
    expectAccepted({ ...flow, nodes: [flow.nodes[0]], edges: [] });
  });

  it('accepts a lane no node sits in', () => {
    const flow = clone(checkoutFlow());
    expectAccepted({ ...flow, lanes: [...flow.lanes, { id: 'workers', name: 'Workers' }] });
  });
});

describe('the document level', () => {
  it('rejects a document that is not an object', () => {
    expectRefusal('checkout', 'not-an-object', '');
  });

  it('rejects null', () => {
    expectRefusal(null, 'not-an-object');
  });

  it('rejects an array', () => {
    expectRefusal([checkoutFlow()], 'not-an-object');
  });

  it('rejects a number', () => {
    expectRefusal(7, 'not-an-object');
  });

  it('rejects nothing at all, which is what a producer that wrote none reads as', () => {
    expectRefusal(undefined, 'not-an-object');
  });

  it('rejects an unknown field, so a producer cannot smuggle keys through the seam', () => {
    expectRefusal({ ...checkoutFlow(), narration: 'a nice story' }, 'unknown-field', 'narration');
  });

  it('rejects a stamp on the document, because the stamp is not a field of the seam', () => {
    expectRefusal({ ...checkoutFlow(), anchorStamp: {} }, 'unknown-field', 'anchorStamp');
  });

  it('rejects a missing id', () => {
    const { id: _id, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'id');
  });

  it('rejects an empty id', () => {
    expectRefusal({ ...checkoutFlow(), id: '   ' }, 'empty-string', 'id');
  });

  it('rejects an id that is not a string', () => {
    expectRefusal({ ...checkoutFlow(), id: 12 }, 'wrong-type', 'id');
  });

  it('rejects a missing name', () => {
    const { name: _name, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'name');
  });

  it('rejects an empty name', () => {
    expectRefusal({ ...checkoutFlow(), name: '' }, 'empty-string', 'name');
  });

  it('collects every refusal in one pass', () => {
    const result = validate({ id: 'checkout' });
    expect(codesOf(result).filter((code) => code === 'missing-field')).toHaveLength(5);
  });
});

describe('the entry point', () => {
  const withEntryPoint = (entryPoint: unknown): unknown => ({ ...checkoutFlow(), entryPoint });

  it('rejects a missing entry point', () => {
    const { entryPoint: _entryPoint, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'entryPoint');
  });

  it('rejects an entry point that is not an object', () => {
    expectRefusal(withEntryPoint(SCREEN_FILE), 'wrong-type', 'entryPoint');
  });

  it('rejects an unknown field on the entry point', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: 12, framework: 'expo-router' }),
      'unknown-field',
      'entryPoint.framework',
    );
  });

  it('accepts a route entry point', () => {
    expectAccepted(withEntryPoint({ kind: 'route', file: SCREEN_FILE, line: 12 }));
  });

  it('accepts a screen entry point', () => {
    expectAccepted(withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: 12 }));
  });

  it('accepts an event listener entry point', () => {
    expectAccepted(withEntryPoint({ kind: 'event-listener', file: SCREEN_FILE, line: 12 }));
  });

  it('rejects an entry point kind outside the three', () => {
    expectRefusal(
      withEntryPoint({ kind: 'cron', file: SCREEN_FILE, line: 12 }),
      'unknown-kind',
      'entryPoint.kind',
    );
  });

  it('rejects a missing entry point file', () => {
    expectRefusal(withEntryPoint({ kind: 'screen', line: 12 }), 'missing-field', 'entryPoint.file');
  });

  it('rejects an entry point anchored to a file the reference graph does not know', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: 'app/screens/invented.tsx', line: 12 }),
      'unknown-file',
      'entryPoint.file',
    );
  });

  it('rejects a missing entry point line', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: SCREEN_FILE }),
      'missing-field',
      'entryPoint.line',
    );
  });

  it('rejects line zero', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: 0 }),
      'invalid-line',
      'entryPoint.line',
    );
  });

  it('rejects a negative line', () => {
    expectRefusal(withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: -3 }), 'invalid-line');
  });

  it('rejects a fractional line', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: 12.5 }),
      'invalid-line',
    );
  });

  it('rejects a line that is not a whole number, however it is spelled', () => {
    for (const line of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
      expectRefusal(withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line }), 'invalid-line');
    }
  });

  it('accepts a whole line written with a fraction of nothing', () => {
    expectAccepted(withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: 12.0 }));
  });

  it('rejects a line that is not a number', () => {
    expectRefusal(
      withEntryPoint({ kind: 'screen', file: SCREEN_FILE, line: '12' }),
      'wrong-type',
      'entryPoint.line',
    );
  });
});

describe('the lanes', () => {
  const withLanes = (lanes: unknown): unknown => ({ ...candidate(), lanes });

  it('rejects a missing lanes field', () => {
    const { lanes: _lanes, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'lanes');
  });

  it('rejects lanes that are not an array', () => {
    expectRefusal(withLanes({ mobile: 'Mobile app' }), 'wrong-type', 'lanes');
  });

  it('rejects a lane that is not an object', () => {
    expectRefusal(withLanes(['mobile']), 'wrong-type', 'lanes[0]');
  });

  it('rejects a lane with an unknown field', () => {
    expectRefusal(
      withLanes([{ id: 'mobile', name: 'Mobile app', colour: 'blue' }]),
      'unknown-field',
      'lanes[0].colour',
    );
  });

  it('rejects a lane with no name', () => {
    expectRefusal(withLanes([{ id: 'mobile' }]), 'missing-field', 'lanes[0].name');
  });

  it('rejects a lane with no id', () => {
    expectRefusal(withLanes([{ name: 'Mobile app' }]), 'missing-field', 'lanes[0].id');
  });

  it('rejects two lanes that claim one id', () => {
    expectRefusal(
      withLanes([
        { id: 'mobile', name: 'Mobile app' },
        { id: 'mobile', name: 'Mobile app again' },
      ]),
      'duplicate-id',
      'lanes[1].id',
    );
  });

  it('accepts no lanes on a candidate', () => {
    expectAccepted(withLanes([]));
  });
});

describe('the nodes', () => {
  const withNodes = (nodes: unknown): unknown => ({ ...checkoutFlow(), nodes, edges: [] });
  const node = (patch: Record<string, unknown>): Record<string, unknown> => ({
    id: 'tap-checkout',
    kind: 'step',
    label: 'Reader taps Place order',
    lane: 'mobile',
    file: SCREEN_FILE,
    line: 12,
    ...patch,
  });

  it('rejects a missing nodes field', () => {
    const { nodes: _nodes, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'nodes');
  });

  it('rejects nodes that are not an array', () => {
    expectRefusal(withNodes('tap-checkout'), 'wrong-type', 'nodes');
  });

  it('rejects a node that is not an object', () => {
    expectRefusal(withNodes(['tap-checkout']), 'wrong-type', 'nodes[0]');
  });

  it('rejects a node with an unknown field', () => {
    expectRefusal(withNodes([node({ confidence: 0.9 })]), 'unknown-field', 'nodes[0].confidence');
  });

  it('accepts a step', () => {
    expectAccepted(withNodes([node({ kind: 'step' })]));
  });

  it('accepts a decision', () => {
    expectAccepted(withNodes([node({ kind: 'decision' })]));
  });

  it('accepts an error exit', () => {
    expectAccepted(withNodes([node({ kind: 'error' })]));
  });

  it('accepts a side effect', () => {
    expectAccepted(withNodes([node({ kind: 'side-effect' })]));
  });

  it('rejects a node kind outside the four', () => {
    expectRefusal(withNodes([node({ kind: 'sideEffect' })]), 'unknown-kind', 'nodes[0].kind');
  });

  it('rejects a node with no label', () => {
    const { label: _label, ...rest } = node({});
    expectRefusal(withNodes([rest]), 'missing-field', 'nodes[0].label');
  });

  it('rejects a node with an empty label', () => {
    expectRefusal(withNodes([node({ label: ' ' })]), 'empty-string', 'nodes[0].label');
  });

  it('rejects a node in a lane the document does not declare', () => {
    expectRefusal(withNodes([node({ lane: 'workers' })]), 'unknown-lane', 'nodes[0].lane');
  });

  it('rejects a node anchored to a file the reference graph does not know', () => {
    expectRefusal(
      withNodes([node({ file: 'app/screens/hallucinated.tsx' })]),
      'unknown-file',
      'nodes[0].file',
    );
  });

  it('rejects a node with no line', () => {
    const { line: _line, ...rest } = node({});
    expectRefusal(withNodes([rest]), 'missing-field', 'nodes[0].line');
  });

  it('rejects a node line of zero', () => {
    expectRefusal(withNodes([node({ line: 0 })]), 'invalid-line', 'nodes[0].line');
  });

  it('rejects two nodes that claim one id', () => {
    expectRefusal(
      withNodes([node({}), node({ label: 'A second tap' })]),
      'duplicate-id',
      'nodes[1].id',
    );
  });

  /**
   * The edge rules read each endpoint's lane and file out of the node index, so the record a
   * duplicated id leaves behind decides what they see. Letting the second node overwrite the first
   * moved every edge already drawn to the first node into whatever lane the second one claimed, and
   * the refusal that came back named a boundary rule that a correct edge had never broken. The node
   * that claimed the id first keeps it, so a duplicate id is refused as itself and nothing else is.
   */
  it('refuses two nodes that claim one id without inventing a second refusal', () => {
    const flow = clone(checkoutFlow());
    const [first] = flow.nodes;
    if (first === undefined) throw new Error('the fixture holds nodes');
    const result = validate({
      ...flow,
      nodes: [...flow.nodes, { ...first, lane: BACKEND_LANE }],
    });
    expect(codesOf(result)).toEqual(['duplicate-id']);
  });

  it('addresses that refusal at the node that came second', () => {
    const flow = clone(checkoutFlow());
    const [first] = flow.nodes;
    if (first === undefined) throw new Error('the fixture holds nodes');
    expectRefusal(
      { ...flow, nodes: [...flow.nodes, { ...first, lane: BACKEND_LANE }] },
      'duplicate-id',
      `nodes[${String(flow.nodes.length)}].id`,
    );
  });

  it('addresses a refusal at the node that caused it', () => {
    const flow = clone(checkoutFlow());
    const nodes = flow.nodes.map((entry, index) =>
      index === 3 ? { ...entry, kind: 'branch' } : entry,
    );
    expectRefusal({ ...flow, nodes, edges: [] }, 'unknown-kind', 'nodes[3].kind');
  });
});

describe('the edges field', () => {
  it('rejects a missing edges field', () => {
    const { edges: _edges, ...rest } = checkoutFlow();
    expectRefusal(rest, 'missing-field', 'edges');
  });

  it('rejects edges that are not an array', () => {
    expectRefusal({ ...checkoutFlow(), edges: {} }, 'wrong-type', 'edges');
  });

  it('rejects an edge that is not an object', () => {
    expectRefusal({ ...checkoutFlow(), edges: ['tap-checkout to post-order'] }, 'wrong-type');
  });
});

describe('a candidate', () => {
  it('rejects edges on a flow with no nodes', () => {
    expectRefusal(
      { ...candidate(), edges: [verifiedEdge('tap-checkout', 'post-order')] },
      'candidate-has-edges',
      'edges',
    );
  });

  it('accepts an entry point kind of route', () => {
    expectAccepted(candidate());
  });

  it('needs no lanes', () => {
    expect(validate(candidate()).ok).toBe(true);
  });

  it('accepts lanes on a candidate, because only nodes and edges are what it lacks', () => {
    expectAccepted({ ...candidate(), lanes: [{ id: 'mobile', name: 'Mobile app' }] });
  });

  /**
   * A candidate is a flow document with no nodes and no edges (ADR-0005), so the rule is about the
   * nodes the document carries, not about the ones that survived validation. A document with one
   * broken node and a set of edges is a traced flow that is wrong, and calling it a candidate names
   * a rule it never broke and hides the one it did.
   */
  it('is not read out of a document whose only node is malformed', () => {
    const document = clone(checkoutFlow());
    const result = validate({ ...document, nodes: [{ id: 'tap-checkout' }] });
    expect(codesOf(result)).not.toContain('candidate-has-edges');
  });

  it('still refuses that document, for the node it could not read', () => {
    const document = clone(checkoutFlow());
    expectRefusal(
      { ...document, nodes: [{ id: 'tap-checkout' }] },
      'missing-field',
      'nodes[0].kind',
    );
  });

  it('is read out of a document that carries no node at all', () => {
    const document = clone(checkoutFlow());
    expectRefusal({ ...document, nodes: [] }, 'candidate-has-edges', 'edges');
  });

  it('is not read out of a document whose nodes are not an array', () => {
    const document = clone(checkoutFlow());
    const result = validate({ ...document, nodes: 'none' });
    expect(codesOf(result)).not.toContain('candidate-has-edges');
  });

  /**
   * The same rule, read off the other side of it. The edges a candidate may not carry are the ones
   * the document was written with, not the ones that survived reading, so an edge too broken to read
   * still breaks the rule. Counting the survivors let a document with no nodes and an unreadable
   * edge come back named for the field it forgot and never for the rule it broke, which is the
   * refusal the reader has to act on.
   */
  it('is read out of a document carrying one edge too broken to read', () => {
    expectRefusal({ ...candidate(), edges: [{}] }, 'candidate-has-edges', 'edges');
  });

  it('still names the fields that edge left out', () => {
    expectRefusal({ ...candidate(), edges: [{}] }, 'missing-field', 'edges[0].kind');
  });

  it('is read out of a document carrying an edge that is not an object at all', () => {
    expectRefusal({ ...candidate(), edges: ['tap-checkout -> post-order'] }, 'candidate-has-edges');
  });

  it('is read out of a document carrying an inferred edge with no evidence', () => {
    expectRefusal(
      { ...candidate(), edges: [{ kind: 'inferred', from: 'a', to: 'b', boundary: 'http' }] },
      'candidate-has-edges',
    );
  });

  it('is not read out of a document whose edges are not an array', () => {
    const result = validate({ ...candidate(), edges: 'none' });
    expect(codesOf(result)).not.toContain('candidate-has-edges');
  });

  it('still refuses that document, for the edges it could not read', () => {
    expectRefusal({ ...candidate(), edges: 'none' }, 'wrong-type', 'edges');
  });
});

describe('a field that is inherited rather than carried', () => {
  /**
   * The seam refuses an unknown field so a producer cannot smuggle a key through it (ADR-0003), and
   * that only holds if a field has to be carried on the value itself. A value that inherits its
   * fields carries none, so `Object.keys` finds nothing to refuse while `in` still reads every one
   * of them off the prototype: the whole document would come in under the rule meant to stop it.
   * Every level reads its own fields only.
   */
  const inherited = (value: object): unknown => Object.create(value) as unknown;

  it('rejects a document that carries no field of its own', () => {
    const result = validate(inherited(checkoutFlow()));
    expect(result.ok).toBe(false);
  });

  it('names every field the document does not carry', () => {
    const result = validate(inherited(checkoutFlow()));
    expect(
      errorsOf(result)
        .map((error) => error.path)
        .sort(),
    ).toEqual(['edges', 'entryPoint', 'id', 'lanes', 'name', 'nodes']);
  });

  it('reads a missing field as missing, not as smuggled', () => {
    expect(codesOf(validate(inherited(checkoutFlow())))).toEqual([
      'missing-field',
      'missing-field',
      'missing-field',
      'missing-field',
      'missing-field',
      'missing-field',
    ]);
  });

  it('rejects an entry point that carries no field of its own', () => {
    const document = clone(checkoutFlow());
    expectRefusal(
      { ...document, entryPoint: inherited(document.entryPoint) },
      'missing-field',
      'entryPoint.kind',
    );
  });

  it('rejects a lane that carries no field of its own', () => {
    const document = clone(checkoutFlow());
    const [lane, ...rest] = document.lanes;
    expectRefusal(
      { ...document, lanes: [inherited(lane ?? {}), ...rest] },
      'missing-field',
      'lanes[0].id',
    );
  });

  it('rejects a node that carries no field of its own', () => {
    const document = clone(checkoutFlow());
    const [node, ...rest] = document.nodes;
    expectRefusal(
      { ...document, nodes: [inherited(node ?? {}), ...rest] },
      'missing-field',
      'nodes[0].id',
    );
  });

  it('rejects an edge that carries no field of its own', () => {
    const document = clone(checkoutFlow());
    const [edge, ...rest] = document.edges;
    expectRefusal(
      { ...document, edges: [inherited(edge ?? {}), ...rest] },
      'missing-field',
      'edges[0].kind',
    );
  });

  it('rejects evidence that carries no field of its own', () => {
    const document = clone(checkoutFlow());
    const boundary = document.edges.find((edge) => edge.kind === 'inferred');
    if (boundary?.kind !== 'inferred') throw new Error('the fixture holds a boundary edge');
    const edges = document.edges.map((edge) =>
      edge === boundary ? { ...boundary, evidence: inherited(boundary.evidence) } : edge,
    );
    expectRefusal({ ...document, edges }, 'missing-evidence');
  });

  it('still accepts a document whose id is spelled like a name Object.prototype carries', () => {
    expectAccepted({ ...clone(checkoutFlow()), id: 'toString' });
  });

  it('still accepts a node whose id is spelled like a name Object.prototype carries', () => {
    const document = clone(checkoutFlow());
    const [node] = document.nodes;
    if (node === undefined) throw new Error('the fixture holds nodes');
    expectAccepted({
      ...document,
      nodes: document.nodes.map((each) => (each === node ? { ...each, id: 'constructor' } : each)),
      edges: document.edges.map((edge) =>
        edge.from === node.id ? { ...edge, from: 'constructor' } : edge,
      ),
    });
  });
});
