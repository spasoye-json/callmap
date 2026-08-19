import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone, SCREEN_FILE, verifiedEdge } from '@archmap/testing';
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
