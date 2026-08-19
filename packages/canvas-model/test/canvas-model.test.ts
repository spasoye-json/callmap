import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone, JOB_FILE, verifiedEdge } from '@archmap/testing';
import {
  boundariesOf,
  buildCanvasModel,
  describeSelection,
  evidenceOf,
  laneSummaryId,
} from '../src/index.ts';
import type { FlowDocument } from '@archmap/flow-document';
import type { CanvasEdge, CanvasModel, CanvasNode } from '../src/index.ts';

const model = (collapsedLanes?: readonly string[]): CanvasModel =>
  buildCanvasModel(checkoutFlow(), collapsedLanes === undefined ? {} : { collapsedLanes });

const nodeOf = (result: CanvasModel, id: string): CanvasNode | undefined =>
  result.nodes.find((node) => node.id === id);

const edgeOf = (result: CanvasModel, id: string): CanvasEdge | undefined =>
  result.edges.find((edge) => edge.id === id);

/** The id a lane's band is drawn under on the fixture flow's canvas. */
const bandId = (laneId: string): string => laneSummaryId(checkoutFlow(), laneId);

describe('buildCanvasModel', () => {
  it('carries the flow id, so the canvas knows what it is showing', () => {
    expect(model().flowId).toBe('checkout');
  });

  it('carries the flow name', () => {
    expect(model().flowName).toBe('Place an order from the checkout screen');
  });

  it('reads a traced flow as traced', () => {
    expect(model().traced).toBe(true);
  });

  it('draws every node of the flow', () => {
    expect(model().nodes).toHaveLength(8);
  });

  it('draws every edge of the flow', () => {
    expect(model().edges).toHaveLength(7);
  });

  it('draws one band per lane', () => {
    expect(model().lanes.map((lane) => lane.id)).toEqual(['mobile', 'backend', 'async']);
  });

  it('counts the nodes of each lane', () => {
    expect(model().lanes.map((lane) => lane.nodeCount)).toEqual([2, 5, 1]);
  });

  it('reports the canvas size', () => {
    expect(model().size.width).toBeGreaterThan(0);
    expect(model().size.height).toBeGreaterThan(0);
  });

  it('places each node where the layout put it', () => {
    expect(nodeOf(model(), 'tap-checkout')?.rect.x).toBeGreaterThan(0);
  });

  it('builds the same model from the same document twice', () => {
    expect(buildCanvasModel(checkoutFlow())).toEqual(buildCanvasModel(checkoutFlow()));
  });

  it('takes the layout measurements through', () => {
    const narrow = buildCanvasModel(checkoutFlow(), { layout: { nodeWidth: 40 } });
    expect(narrow.nodes[0]?.rect.width).toBe(40);
  });
});

describe('the shape of a node', () => {
  it('draws a step as a rectangle', () => {
    expect(nodeOf(model(), 'tap-checkout')?.shape).toBe('rectangle');
  });

  it('draws a decision as a diamond', () => {
    expect(nodeOf(model(), 'check-cart')?.shape).toBe('diamond');
  });

  it('draws an error exit as a hexagon', () => {
    expect(nodeOf(model(), 'reject-empty-cart')?.shape).toBe('hexagon');
  });

  it('draws a side effect as a parallelogram', () => {
    expect(nodeOf(model(), 'persist-order')?.shape).toBe('parallelogram');
  });

  it('carries the node kind through unchanged', () => {
    expect(nodeOf(model(), 'check-cart')?.kind).toBe('decision');
  });

  it('carries the node label through unchanged', () => {
    expect(nodeOf(model(), 'check-cart')?.label).toBe('Is the cart empty?');
  });
});

describe('click to editor', () => {
  it('anchors a node to its file and line', () => {
    expect(nodeOf(model(), 'send-receipt')?.anchor).toEqual({ file: JOB_FILE, line: 9 });
  });

  it('anchors every drawn node', () => {
    for (const node of model().nodes) {
      expect(node.anchor).not.toBeNull();
    }
  });

  it('anchors no collapsed lane, because a lane is not a place in the code', () => {
    expect(nodeOf(model(['async']), bandId('async'))?.anchor).toBeNull();
  });
});

describe('the ink of an edge', () => {
  it('draws a verified edge solid', () => {
    expect(edgeOf(model(), 'receive-order->check-cart')?.ink).toBe('solid');
  });

  it('draws an inferred edge dashed', () => {
    expect(edgeOf(model(), 'post-order->receive-order')?.ink).toBe('dashed');
  });

  it('draws the two classes in two inks', () => {
    const inks = new Set(model().edges.map((edge) => edge.ink));
    expect(inks).toEqual(new Set(['solid', 'dashed']));
  });

  it('carries the edge class through unchanged', () => {
    expect(edgeOf(model(), 'post-order->receive-order')?.kind).toBe('inferred');
  });

  it('marks no edge as rerouted while every lane is open', () => {
    expect(model().edges.every((edge) => !edge.rerouted)).toBe(true);
  });
});

describe('the evidence on selection', () => {
  it('reads the quoted match off an inferred edge', () => {
    const edge = edgeOf(model(), 'post-order->receive-order');
    expect(edge && evidenceOf(edge).map((item) => item.quote)).toEqual([
      "post '/orders', to: 'orders#create'",
    ]);
  });

  it('reads the boundary off an inferred edge', () => {
    const edge = edgeOf(model(), 'emit-order-placed->send-receipt');
    expect(edge && boundariesOf(edge)).toEqual(['event']);
  });

  it('reads no evidence off a verified edge, which needs none', () => {
    const edge = edgeOf(model(), 'receive-order->check-cart');
    expect(edge && evidenceOf(edge)).toEqual([]);
  });

  it('reads no boundary off a verified edge', () => {
    const edge = edgeOf(model(), 'receive-order->check-cart');
    expect(edge && boundariesOf(edge)).toEqual([]);
  });

  it('keeps the file and line the evidence was read from', () => {
    const edge = edgeOf(model(), 'emit-order-placed->send-receipt');
    expect(edge && evidenceOf(edge)[0]).toEqual({
      quote: "subscribe_to 'order.placed'",
      file: JOB_FILE,
      line: 4,
    });
  });
});

describe('collapsing a lane', () => {
  it('hides every node of the collapsed lane', () => {
    const result = model(['backend']);
    expect(result.nodes.map((node) => node.id)).not.toContain('receive-order');
  });

  it('draws one band in their place', () => {
    expect(nodeOf(model(['backend']), bandId('backend'))).toBeDefined();
  });

  it('draws the band as a band', () => {
    expect(nodeOf(model(['backend']), bandId('backend'))?.shape).toBe('band');
  });

  it('labels the band with the lane name', () => {
    expect(nodeOf(model(['backend']), bandId('backend'))?.label).toBe('Backend request');
  });

  it('counts what the band stands for', () => {
    expect(nodeOf(model(['backend']), bandId('backend'))?.collapsedCount).toBe(5);
  });

  it('marks the lane collapsed', () => {
    expect(model(['backend']).lanes.find((lane) => lane.id === 'backend')?.collapsed).toBe(true);
  });

  it('leaves the other lanes open', () => {
    const result = model(['backend']);
    expect(result.lanes.filter((lane) => lane.collapsed).map((lane) => lane.id)).toEqual([
      'backend',
    ]);
  });

  it('leaves the nodes of the other lanes drawn', () => {
    expect(nodeOf(model(['backend']), 'tap-checkout')).toBeDefined();
  });

  it('does not move the nodes of the other lanes', () => {
    expect(nodeOf(model(['backend']), 'tap-checkout')?.rect).toEqual(
      nodeOf(model(), 'tap-checkout')?.rect,
    );
  });

  it('covers the space the hidden nodes held', () => {
    const band = nodeOf(model(['backend']), bandId('backend'));
    const wide = nodeOf(model(), 'persist-order');
    expect(band?.rect.width).toBeGreaterThan(wide?.rect.width ?? 0);
  });

  it('drops an edge that ran inside the collapsed lane', () => {
    expect(edgeOf(model(['backend']), 'receive-order->check-cart')).toBeUndefined();
  });

  it('reroutes an edge that ran into the collapsed lane', () => {
    expect(edgeOf(model(['backend']), `post-order->${bandId('backend')}`)).toBeDefined();
  });

  it('reroutes an edge that ran out of the collapsed lane', () => {
    expect(edgeOf(model(['backend']), `${bandId('backend')}->send-receipt`)).toBeDefined();
  });

  it('marks a rerouted edge as rerouted', () => {
    expect(edgeOf(model(['backend']), `post-order->${bandId('backend')}`)?.rerouted).toBe(true);
  });

  it('keeps the evidence of a rerouted inferred edge readable', () => {
    const edge = edgeOf(model(['backend']), `post-order->${bandId('backend')}`);
    expect(edge && evidenceOf(edge)).toHaveLength(1);
  });

  it('collapses two lanes at once', () => {
    const result = model(['mobile', 'async']);
    expect(result.nodes.map((node) => node.id)).toEqual([
      bandId('mobile'),
      'receive-order',
      'check-cart',
      'persist-order',
      'reject-empty-cart',
      'emit-order-placed',
      bandId('async'),
    ]);
  });

  it('ignores a lane id the flow does not hold', () => {
    expect(model(['workers']).nodes).toHaveLength(8);
  });

  it('collapses no lane by default', () => {
    expect(model().lanes.every((lane) => !lane.collapsed)).toBe(true);
  });

  it('does not collapse a lane that holds no nodes, because there is nothing to hide', () => {
    const flow = clone(checkoutFlow());
    const withEmpty = { ...flow, lanes: [...flow.lanes, { id: 'workers', name: 'Workers' }] };
    const result = buildCanvasModel(withEmpty, { collapsedLanes: ['workers'] });
    expect(result.lanes.find((lane) => lane.id === 'workers')?.collapsed).toBe(false);
  });
});

describe('merging edges onto a collapsed lane', () => {
  it('merges two edges that now run between the same pair', () => {
    const flow = clone(checkoutFlow());
    const withSecondHop = {
      ...flow,
      edges: [
        ...flow.edges,
        {
          kind: 'inferred' as const,
          from: 'tap-checkout',
          to: 'receive-order',
          boundary: 'http' as const,
          evidence: { quote: "post '/orders'", file: JOB_FILE, line: 4 },
        },
      ],
    };
    const result = buildCanvasModel(withSecondHop, { collapsedLanes: ['mobile'] });
    const merged = result.edges.filter((edge) => edge.to === 'receive-order');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sources).toHaveLength(2);
  });

  it('merges two edges that now leave the same collapsed lane', () => {
    const flow = clone(checkoutFlow());
    const withSecondListener = {
      ...flow,
      edges: [
        ...flow.edges,
        {
          kind: 'inferred' as const,
          from: 'persist-order',
          to: 'send-receipt',
          boundary: 'event' as const,
          evidence: { quote: "subscribe_to 'order.written'", file: JOB_FILE, line: 5 },
        },
      ],
    };
    const result = buildCanvasModel(withSecondListener, { collapsedLanes: ['backend'] });
    const merged = result.edges.filter((edge) => edge.to === 'send-receipt');
    expect(merged).toHaveLength(1);
    expect(merged[0] && evidenceOf(merged[0])).toHaveLength(2);
  });

  it('lets an inferred source win the merge, so a proposal never looks proven', () => {
    const flow = clone(checkoutFlow());
    const withExtra = {
      ...flow,
      edges: [...flow.edges, verifiedEdge('tap-checkout', 'receive-order')],
    };
    const result = buildCanvasModel(withExtra, { collapsedLanes: ['mobile'] });
    const merged = result.edges.filter((edge) => edge.to === 'receive-order');
    expect(merged[0]?.kind).toBe('inferred');
    expect(merged[0]?.ink).toBe('dashed');
  });
});

describe('describeSelection', () => {
  it('resolves a node', () => {
    expect(describeSelection(model(), 'check-cart')?.kind).toBe('node');
  });

  it('resolves an edge', () => {
    expect(describeSelection(model(), 'post-order->receive-order')?.kind).toBe('edge');
  });

  it('reads the evidence onto an edge selection', () => {
    const selection = describeSelection(model(), 'post-order->receive-order');
    expect(selection?.kind === 'edge' && selection.evidence).toHaveLength(1);
  });

  it('reads no evidence onto a verified edge selection', () => {
    const selection = describeSelection(model(), 'receive-order->check-cart');
    expect(selection?.kind === 'edge' && selection.evidence).toEqual([]);
  });

  it('resolves a lane', () => {
    expect(describeSelection(model(), 'backend')?.kind).toBe('lane');
  });

  it('resolves a collapsed lane band as a node', () => {
    expect(describeSelection(model(['async']), bandId('async'))?.kind).toBe('node');
  });

  it('resolves nothing for an id the canvas does not hold', () => {
    expect(describeSelection(model(), 'ghost')).toBeNull();
  });
});

describe('a candidate on the canvas', () => {
  const result = buildCanvasModel(candidate());

  it('does not read as traced', () => {
    expect(result.traced).toBe(false);
  });

  it('draws no nodes', () => {
    expect(result.nodes).toEqual([]);
  });

  it('draws no edges', () => {
    expect(result.edges).toEqual([]);
  });

  it('draws no lanes', () => {
    expect(result.lanes).toEqual([]);
  });

  it('still carries its name, so the canvas can say what is not traced yet', () => {
    expect(result.flowName).toBe('Refund an order from the admin screen');
  });
});

describe('two edges whose composed ids would collide', () => {
  /** `a -> b->c` and `a->b -> c` both compose to one string, but they are two edges. */
  const awkwardIds = (): FlowDocument => ({
    id: 'awkward-ids',
    name: 'Two hops that compose to one id',
    entryPoint: { kind: 'route', file: JOB_FILE, line: 1 },
    lanes: [{ id: 'backend', name: 'Backend request' }],
    nodes: ['a', 'b->c', 'a->b', 'c'].map((id) => ({
      id,
      kind: 'step' as const,
      label: `The step called ${id}`,
      lane: 'backend',
      file: JOB_FILE,
      line: 2,
    })),
    edges: [verifiedEdge('a', 'b->c'), verifiedEdge('a->b', 'c')],
  });

  it('draws them as two edges, not one merged edge', () => {
    expect(buildCanvasModel(awkwardIds()).edges).toHaveLength(2);
  });

  it('keeps one source on each', () => {
    expect(buildCanvasModel(awkwardIds()).edges.map((edge) => edge.sources.length)).toEqual([1, 1]);
  });

  it('draws them under two ids, so a click resolves one edge and not the other', () => {
    const ids = buildCanvasModel(awkwardIds()).edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('resolves each edge by its own id', () => {
    const result = buildCanvasModel(awkwardIds());
    for (const edge of result.edges) {
      const selection = describeSelection(result, edge.id);
      expect(selection?.kind === 'edge' ? selection.edge.sources : undefined).toEqual(edge.sources);
    }
  });

  it('resolves the edge that starts where the reader clicked', () => {
    const result = buildCanvasModel(awkwardIds());
    for (const edge of result.edges) {
      const selection = describeSelection(result, edge.id);
      expect(selection?.kind === 'edge' ? selection.edge.from : undefined).toBe(edge.from);
    }
  });

  it('leaves the id of an edge nothing collides with composed as it reads', () => {
    expect(model().edges.map((edge) => edge.id)).toContain('tap-checkout->post-order');
  });
});

describe('a node id that a collapsed lane would take', () => {
  /**
   * A band stands in for a collapsed lane under an id of its own, but node ids come off an AI pass,
   * so a document may well hold a node spelled exactly like one. Two canvas nodes under one id
   * would send the reader to the wrong panel and would reroute an edge onto the wrong end, which is
   * the same class of collision the composed edge id already guards against.
   */
  const trapped = (): FlowDocument => ({
    id: 'trapped-band',
    name: 'A node named after a band',
    entryPoint: { kind: 'route', file: JOB_FILE, line: 1 },
    lanes: [
      { id: 'mobile', name: 'Mobile app' },
      { id: 'backend', name: 'Backend request' },
    ],
    nodes: [
      {
        /** Spelled out, because this is the id the band would take if no node had claimed it. */
        id: 'lane:backend',
        kind: 'step',
        label: 'A step named after the backend band',
        lane: 'mobile',
        file: JOB_FILE,
        line: 2,
      },
      {
        id: 'handle',
        kind: 'step',
        label: 'Handle the request',
        lane: 'backend',
        file: JOB_FILE,
        line: 3,
      },
    ],
    edges: [verifiedEdge('lane:backend', 'handle')],
  });

  const collapsed = (): CanvasModel => buildCanvasModel(trapped(), { collapsedLanes: ['backend'] });

  const bandOf = (result: CanvasModel): CanvasNode | undefined =>
    result.nodes.find((node) => node.kind === 'lane-summary');

  it('draws the node and the band under two ids', () => {
    const ids = collapsed().nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves the node its own id, because the node was there first', () => {
    expect(collapsed().nodes.map((node) => node.id)).toContain('lane:backend');
  });

  it('still draws one band for the collapsed lane', () => {
    expect(bandOf(collapsed())?.label).toBe('Backend request');
  });

  it('counts what the band stands for', () => {
    expect(bandOf(collapsed())?.collapsedCount).toBe(1);
  });

  it('says on the lane which id its band is drawn under', () => {
    const lane = collapsed().lanes.find((candidate) => candidate.id === 'backend');
    expect(lane?.summaryId).toBe(bandOf(collapsed())?.id);
  });

  it('reroutes the edge onto the band, not onto the node of that name', () => {
    const [edge] = collapsed().edges;
    expect(edge?.to).toBe(bandOf(collapsed())?.id);
  });

  it('reads the edge as rerouted', () => {
    expect(collapsed().edges[0]?.rerouted).toBe(true);
  });

  it('resolves the node when the reader clicks the node', () => {
    const selection = describeSelection(collapsed(), 'lane:backend');
    expect(selection?.kind === 'node' ? selection.node.kind : undefined).toBe('step');
  });

  it('resolves the band when the reader clicks the band', () => {
    const result = collapsed();
    const id = bandOf(result)?.id ?? '';
    const selection = describeSelection(result, id);
    expect(selection?.kind === 'node' ? selection.node.kind : undefined).toBe('lane-summary');
  });

  it('names the band under the usual id when no node has taken it', () => {
    const lane = model(['backend']).lanes.find((candidate) => candidate.id === 'backend');
    expect(lane?.summaryId).toBe('lane:backend');
  });

  it('escalates the prefix only as far as the node ids force it', () => {
    const lane = collapsed().lanes.find((candidate) => candidate.id === 'backend');
    expect(lane?.summaryId).toBe('lane::backend');
  });

  it('reads the same id off laneSummaryId for the document it was given', () => {
    expect(laneSummaryId(trapped(), 'backend')).toBe('lane::backend');
  });

  it('gives every lane a summary id, collapsed or not', () => {
    expect(model().lanes.map((lane) => lane.summaryId)).toEqual([
      bandId('mobile'),
      bandId('backend'),
      bandId('async'),
    ]);
  });
});
