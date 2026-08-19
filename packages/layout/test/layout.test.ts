import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone } from '@archmap/testing';
import {
  DEFAULT_LAYOUT_OPTIONS,
  laidOutLane,
  laidOutNode,
  layOutFlow,
  type FlowLayout,
} from '../src/index.ts';

const layout = (): FlowLayout => layOutFlow(checkoutFlow());

const boxOf = (result: FlowLayout, id: string) => laidOutNode(result, id)?.box;

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
    expect(lanes[1]?.box.y).toBeGreaterThan(
      (lanes[0]?.box.y ?? 0) + (lanes[0]?.box.height ?? 0) - 1,
    );
    expect(lanes[2]?.box.y).toBeGreaterThan(
      (lanes[1]?.box.y ?? 0) + (lanes[1]?.box.height ?? 0) - 1,
    );
  });

  it('gives every lane the same width, so the canvas is a rectangle', () => {
    const widths = new Set(layout().lanes.map((lane) => lane.box.width));
    expect(widths.size).toBe(1);
  });

  it('lists the nodes of each lane on the lane', () => {
    expect(laidOutLane(layout(), 'async')?.nodeIds).toEqual(['send-receipt']);
  });

  it('lists the nodes of a lane in flow order', () => {
    expect(laidOutLane(layout(), 'mobile')?.nodeIds).toEqual(['tap-checkout', 'post-order']);
  });

  it('runs the flow left to right', () => {
    expect(boxOf(layout(), 'post-order')?.x).toBeGreaterThan(
      boxOf(layout(), 'tap-checkout')?.x ?? 0,
    );
  });

  it('keeps a node in the band of its own lane', () => {
    const result = layout();
    for (const node of result.nodes) {
      const lane = laidOutLane(result, node.lane);
      expect(node.box.y).toBeGreaterThanOrEqual(lane?.box.y ?? 0);
      expect(node.box.y + node.box.height).toBeLessThanOrEqual(
        (lane?.box.y ?? 0) + (lane?.box.height ?? 0),
      );
    }
  });

  it('leaves room down the left for the lane names', () => {
    for (const node of layout().nodes) {
      expect(node.box.x).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_OPTIONS.laneHeaderWidth);
    }
  });

  it('overlaps no two nodes', () => {
    const nodes = layout().nodes;
    for (const [index, node] of nodes.entries()) {
      for (const other of nodes.slice(index + 1)) {
        expect(overlaps(node.box, other.box), `${node.id} overlaps ${other.id}`).toBe(false);
      }
    }
  });

  it('gives the two branches of a decision one column and two rows', () => {
    const reject = laidOutNode(layout(), 'reject-empty-cart');
    const persist = laidOutNode(layout(), 'persist-order');
    expect(reject?.box.x).toBe(persist?.box.x);
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
      expect(node.box.x + node.box.width).toBeLessThanOrEqual(result.size.width);
    }
  });

  it('reports a canvas tall enough to hold the last lane', () => {
    const result = layout();
    const last = result.lanes.at(-1);
    expect((last?.box.y ?? 0) + (last?.box.height ?? 0)).toBe(result.size.height);
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

  it('does not move a box when the nodes are written in another order', () => {
    const flow = clone(checkoutFlow());
    const shuffled = { ...flow, nodes: [...flow.nodes].reverse() };
    expect(layOutFlow(shuffled)).toEqual(layOutFlow(flow));
  });

  it('does not move a box when the edges are written in another order', () => {
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
    expect(boxOf(layout(), 'tap-checkout')?.width).toBe(DEFAULT_LAYOUT_OPTIONS.nodeWidth);
  });

  it('takes a node width', () => {
    const result = layOutFlow(checkoutFlow(), { nodeWidth: 100 });
    expect(laidOutNode(result, 'tap-checkout')?.box.width).toBe(100);
  });

  it('takes a node height', () => {
    const result = layOutFlow(checkoutFlow(), { nodeHeight: 40 });
    expect(laidOutNode(result, 'tap-checkout')?.box.height).toBe(40);
  });

  it('takes a column gap', () => {
    const result = layOutFlow(checkoutFlow(), { nodeWidth: 100, columnGap: 10 });
    expect(laidOutNode(result, 'post-order')?.box.x).toBe(
      (laidOutNode(result, 'tap-checkout')?.box.x ?? 0) + 110,
    );
  });

  it('takes a row gap', () => {
    const result = layOutFlow(checkoutFlow(), { nodeHeight: 50, rowGap: 5 });
    expect(laidOutNode(result, 'reject-empty-cart')?.box.y).toBe(
      (laidOutNode(result, 'persist-order')?.box.y ?? 0) + 55,
    );
  });

  it('takes a lane header width', () => {
    const result = layOutFlow(checkoutFlow(), { laneHeaderWidth: 0, lanePadding: 0 });
    expect(laidOutNode(result, 'tap-checkout')?.box.x).toBe(0);
  });

  it('takes a lane gap', () => {
    const result = layOutFlow(checkoutFlow(), { laneGap: 0 });
    const lanes = result.lanes;
    expect(lanes[1]?.box.y).toBe((lanes[0]?.box.y ?? 0) + (lanes[0]?.box.height ?? 0));
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
    expect(lane?.box.height).toBe(
      DEFAULT_LAYOUT_OPTIONS.nodeHeight + DEFAULT_LAYOUT_OPTIONS.lanePadding * 2,
    );
  });

  it('holds no nodes', () => {
    expect(laidOutLane(layOutFlow(withEmptyLane()), 'workers')?.nodeIds).toEqual([]);
  });
});
