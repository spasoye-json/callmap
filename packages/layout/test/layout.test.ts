import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone, verifiedEdge } from '@archmap/testing';
import {
  DEFAULT_LAYOUT_OPTIONS,
  laidOutLane,
  laidOutNode,
  laidOutNodesOfLane,
  layOutFlow,
  LayoutError,
  rankNodes,
  type FlowLayout,
} from '../src/index.ts';

const layout = (): FlowLayout => layOutFlow(checkoutFlow());

const rectOf = (result: FlowLayout, id: string) => laidOutNode(result, id)?.rect;

const overlaps = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

describe('layOutFlow', () => {
  it('places every node of the flow', () => {
    expect(layout().nodes).toHaveLength(checkoutFlow().nodes.length);
  });

  it('lays out one band per lane', () => {
    expect(layout().lanes).toHaveLength(3);
  });

  it('stacks the lanes in the order the document declares them', () => {
    expect(layout().lanes.map((lane) => lane.id)).toEqual(['mobile', 'backend', 'async']);
  });

  it('carries each lane name through, so the canvas needs no second lookup', () => {
    expect(laidOutLane(layout(), 'backend')?.name).toBe('Backend request');
  });

  it('numbers the lanes from the top', () => {
    expect(layout().lanes.map((lane) => lane.index)).toEqual([0, 1, 2]);
  });

  it('stacks each lane below the one before it', () => {
    const lanes = layout().lanes;
    expect(lanes[1]?.rect.y).toBeGreaterThan(
      (lanes[0]?.rect.y ?? 0) + (lanes[0]?.rect.height ?? 0) - 1,
    );
    expect(lanes[2]?.rect.y).toBeGreaterThan(
      (lanes[1]?.rect.y ?? 0) + (lanes[1]?.rect.height ?? 0) - 1,
    );
  });

  it('gives every lane the same width, so the canvas is a rectangle', () => {
    const widths = new Set(layout().lanes.map((lane) => lane.rect.width));
    expect(widths.size).toBe(1);
  });

  it('lists the nodes of each lane on the lane', () => {
    expect(laidOutLane(layout(), 'async')?.nodeIds).toEqual(['send-receipt']);
  });

  it('lists the nodes of a lane in flow order', () => {
    expect(laidOutLane(layout(), 'mobile')?.nodeIds).toEqual(['tap-checkout', 'post-order']);
  });

  it('runs the flow left to right', () => {
    expect(rectOf(layout(), 'post-order')?.x).toBeGreaterThan(
      rectOf(layout(), 'tap-checkout')?.x ?? 0,
    );
  });

  it('keeps a node in the band of its own lane', () => {
    const result = layout();
    for (const node of result.nodes) {
      const lane = laidOutLane(result, node.lane);
      expect(node.rect.y).toBeGreaterThanOrEqual(lane?.rect.y ?? 0);
      expect(node.rect.y + node.rect.height).toBeLessThanOrEqual(
        (lane?.rect.y ?? 0) + (lane?.rect.height ?? 0),
      );
    }
  });

  it('leaves room down the left for the lane names', () => {
    for (const node of layout().nodes) {
      expect(node.rect.x).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_OPTIONS.laneHeaderWidth);
    }
  });

  it('overlaps no two nodes', () => {
    const nodes = layout().nodes;
    for (const [index, node] of nodes.entries()) {
      for (const other of nodes.slice(index + 1)) {
        expect(overlaps(node.rect, other.rect), `${node.id} overlaps ${other.id}`).toBe(false);
      }
    }
  });

  it('gives the two branches of a decision one column and two rows', () => {
    const reject = laidOutNode(layout(), 'reject-empty-cart');
    const persist = laidOutNode(layout(), 'persist-order');
    expect(reject?.rect.x).toBe(persist?.rect.x);
    expect(reject?.row).not.toBe(persist?.row);
  });

  it('orders two nodes of one column by id, never by array order', () => {
    const result = layout();
    expect(laidOutNode(result, 'persist-order')?.row).toBe(0);
    expect(laidOutNode(result, 'reject-empty-cart')?.row).toBe(1);
  });

  it('counts the columns the flow is long', () => {
    expect(layout().columns).toBe(7);
  });

  it('reports a canvas wide enough to hold the last column', () => {
    const result = layout();
    for (const node of result.nodes) {
      expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(result.size.width);
    }
  });

  it('reports a canvas tall enough to hold the last lane', () => {
    const result = layout();
    const last = result.lanes.at(-1);
    expect((last?.rect.y ?? 0) + (last?.rect.height ?? 0)).toBe(result.size.height);
  });

  it('finds no node the layout does not hold', () => {
    expect(laidOutNode(layout(), 'ghost')).toBeUndefined();
  });

  it('finds no lane the layout does not hold', () => {
    expect(laidOutLane(layout(), 'workers')).toBeUndefined();
  });
});

describe('a deterministic layout', () => {
  it('lays the same document out the same way twice', () => {
    expect(layOutFlow(checkoutFlow())).toEqual(layOutFlow(checkoutFlow()));
  });

  it('does not move a node when the nodes are written in another order', () => {
    const flow = clone(checkoutFlow());
    const shuffled = { ...flow, nodes: [...flow.nodes].reverse() };
    expect(layOutFlow(shuffled)).toEqual(layOutFlow(flow));
  });

  it('does not move a node when the edges are written in another order', () => {
    const flow = clone(checkoutFlow());
    const shuffled = { ...flow, edges: [...flow.edges].reverse() };
    expect(layOutFlow(shuffled)).toEqual(layOutFlow(flow));
  });

  it('does move the bands when the lanes are declared in another order', () => {
    const flow = clone(checkoutFlow());
    const reordered = { ...flow, lanes: [...flow.lanes].reverse() };
    expect(layOutFlow(reordered).lanes.map((lane) => lane.id)).toEqual([
      'async',
      'backend',
      'mobile',
    ]);
  });

  it('does not depend on the flow name', () => {
    const flow = clone(checkoutFlow());
    expect(layOutFlow({ ...flow, name: 'Something else' })).toEqual(layOutFlow(flow));
  });
});

describe('the measurements', () => {
  it('uses the default node size', () => {
    expect(rectOf(layout(), 'tap-checkout')?.width).toBe(DEFAULT_LAYOUT_OPTIONS.nodeWidth);
  });

  it('takes a node width', () => {
    const result = layOutFlow(checkoutFlow(), { nodeWidth: 100 });
    expect(laidOutNode(result, 'tap-checkout')?.rect.width).toBe(100);
  });

  it('takes a node height', () => {
    const result = layOutFlow(checkoutFlow(), { nodeHeight: 40 });
    expect(laidOutNode(result, 'tap-checkout')?.rect.height).toBe(40);
  });

  it('takes a column gap', () => {
    const result = layOutFlow(checkoutFlow(), { nodeWidth: 100, columnGap: 10 });
    expect(laidOutNode(result, 'post-order')?.rect.x).toBe(
      (laidOutNode(result, 'tap-checkout')?.rect.x ?? 0) + 110,
    );
  });

  it('takes a row gap', () => {
    const result = layOutFlow(checkoutFlow(), { nodeHeight: 50, rowGap: 5 });
    expect(laidOutNode(result, 'reject-empty-cart')?.rect.y).toBe(
      (laidOutNode(result, 'persist-order')?.rect.y ?? 0) + 55,
    );
  });

  it('takes a lane header width', () => {
    const result = layOutFlow(checkoutFlow(), { laneHeaderWidth: 0, lanePadding: 0 });
    expect(laidOutNode(result, 'tap-checkout')?.rect.x).toBe(0);
  });

  it('takes a lane gap', () => {
    const result = layOutFlow(checkoutFlow(), { laneGap: 0 });
    const lanes = result.lanes;
    expect(lanes[1]?.rect.y).toBe((lanes[0]?.rect.y ?? 0) + (lanes[0]?.rect.height ?? 0));
  });
});

describe('a candidate', () => {
  it('lays out with no nodes', () => {
    expect(layOutFlow(candidate()).nodes).toEqual([]);
  });

  it('lays out with no lanes, because a candidate declares none', () => {
    expect(layOutFlow(candidate()).lanes).toEqual([]);
  });

  it('is no columns long', () => {
    expect(layOutFlow(candidate()).columns).toBe(0);
  });

  it('needs no height', () => {
    expect(layOutFlow(candidate()).size.height).toBe(0);
  });
});

describe('a lane no node sits in', () => {
  const withEmptyLane = () => {
    const flow = clone(checkoutFlow());
    return { ...flow, lanes: [...flow.lanes, { id: 'workers', name: 'Workers' }] };
  };

  it('still gets a band, so the reader sees the lane exists', () => {
    expect(laidOutLane(layOutFlow(withEmptyLane()), 'workers')).toBeDefined();
  });

  it('gets a band one row tall', () => {
    const lane = laidOutLane(layOutFlow(withEmptyLane()), 'workers');
    expect(lane?.rect.height).toBe(
      DEFAULT_LAYOUT_OPTIONS.nodeHeight + DEFAULT_LAYOUT_OPTIONS.lanePadding * 2,
    );
  });

  it('holds no nodes', () => {
    expect(laidOutLane(layOutFlow(withEmptyLane()), 'workers')?.nodeIds).toEqual([]);
  });
});

describe('laidOutNodesOfLane', () => {
  it('gives the placed nodes of one lane in flow order', () => {
    expect(laidOutNodesOfLane(layout(), 'mobile').map((node) => node.id)).toEqual([
      'tap-checkout',
      'post-order',
    ]);
  });

  it('gives the nodes of a lane the whole flow crosses', () => {
    expect(laidOutNodesOfLane(layout(), 'backend')).toHaveLength(5);
  });

  it('gives nothing for a lane no node sits in', () => {
    const flow = clone(checkoutFlow());
    const withEmpty = { ...flow, lanes: [...flow.lanes, { id: 'workers', name: 'Workers' }] };
    expect(laidOutNodesOfLane(layOutFlow(withEmpty), 'workers')).toEqual([]);
  });

  it('gives nothing for a lane the flow does not declare', () => {
    expect(laidOutNodesOfLane(layout(), 'invented')).toEqual([]);
  });
});

describe('a document that cannot be laid out', () => {
  /**
   * The validator refuses all three of these at the seam, so a document that came through it lays
   * out. The layout is asked for by name all the same, and each contradiction here has a silent
   * answer that is worse than a refusal: a reviewer cannot tell which part of a canvas is the wrong
   * part (ADR-0001), so a canvas missing a node, or holding one twice, is worth nothing to them.
   * Every other module of the core refuses what it cannot draw a true answer from; so does this one.
   */
  const flow = () => clone(checkoutFlow());

  describe('a node in a lane the document does not declare', () => {
    const orphaned = () => {
      const document = flow();
      return { ...document, lanes: document.lanes.slice(0, 1) };
    };

    it('is refused, rather than dropped from a canvas that then reads as whole', () => {
      expect(() => layOutFlow(orphaned())).toThrow(LayoutError);
    });

    it('names the node and the lane it claims', () => {
      expect(() => layOutFlow(orphaned())).toThrow(/receive-order/);
      expect(() => layOutFlow(orphaned())).toThrow(/backend/);
    });

    it('is refused even when the document declares no lane at all', () => {
      expect(() => layOutFlow({ ...flow(), lanes: [] })).toThrow(LayoutError);
    });

    it('leaves a candidate alone, which has no node to place in a lane', () => {
      expect(() => layOutFlow({ ...candidate(), lanes: [] })).not.toThrow();
    });
  });

  describe('two lanes claiming one id', () => {
    const doubled = () => {
      const document = flow();
      return { ...document, lanes: [...document.lanes, { id: 'backend', name: 'Backend again' }] };
    };

    it('is refused, because both bands would hold the same nodes', () => {
      expect(() => layOutFlow(doubled())).toThrow(LayoutError);
    });

    it('names the id the two lanes claim', () => {
      expect(() => layOutFlow(doubled())).toThrow(/backend/);
    });
  });

  describe('an edge naming a node the document does not hold', () => {
    const dangling = (from: string, to: string) => {
      const document = flow();
      return { ...document, edges: [...document.edges, verifiedEdge(from, to)] };
    };

    it('is refused when the edge runs into a node nothing declares', () => {
      expect(() => layOutFlow(dangling('tap-checkout', 'invented'))).toThrow(LayoutError);
    });

    it('is refused when the edge runs out of one', () => {
      expect(() => layOutFlow(dangling('invented', 'persist-order'))).toThrow(LayoutError);
    });

    it('names the node nothing declares, and the edge that reaches for it', () => {
      expect(() => layOutFlow(dangling('tap-checkout', 'invented'))).toThrow(/invented/);
      expect(() => layOutFlow(dangling('tap-checkout', 'invented'))).toThrow(/tap-checkout/);
    });

    /**
     * The ranking is why this cannot be read past. A predecessor no node declares is never ranked,
     * so every node downstream of it is never ready, and the tie-break that exists to cut a genuine
     * loop takes them in id order instead. One edge from an id nothing holds moved the emitted event
     * from the sixth column to the first, drawing the side effect that follows the write to the left
     * of it. The canvas reads perfectly well and says the wrong thing.
     */
    it('does not let one unheld id reorder the columns of the flow', () => {
      expect(() => rankNodes(dangling('invented', 'persist-order'))).not.toThrow();
      const ranks = rankNodes(flow());
      expect(ranks.get('emit-order-placed')).toBeGreaterThan(ranks.get('persist-order') ?? 0);
    });
  });

  describe('two nodes claiming one id', () => {
    const doubled = () => {
      const document = flow();
      const first = document.nodes[0];
      if (first === undefined) throw new Error('the fixture has no node to double');
      return {
        ...document,
        nodes: [...document.nodes, { ...first, label: 'The same step again' }],
      };
    };

    it('is refused, because the reader would click one id and reach either', () => {
      expect(() => layOutFlow(doubled())).toThrow(LayoutError);
    });

    it('names the id the two nodes claim', () => {
      expect(() => layOutFlow(doubled())).toThrow(/tap-checkout/);
    });
  });
});
