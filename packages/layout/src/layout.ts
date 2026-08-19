/**
 * The deterministic layout: a validated flow document in, a rectangle per node and per lane out.
 *
 * The same document always lays out to the same rectangles, whatever order its nodes and edges were
 * written in, so a flow does not rearrange itself when it is saved and reopened. Lanes are bands
 * stacked in the order the document declares them, and the flow runs left to right across them.
 */

import type { FlowDocument } from '@archmap/flow-document';
import { rankNodes } from './rank.ts';

/** A rectangle in canvas space. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One node, placed. */
export interface LaidOutNode {
  readonly id: string;
  readonly lane: string;
  /** How far along the flow the node sits: its column. */
  readonly rank: number;
  /** Which line inside its lane the node sits on, when a lane holds two nodes at one rank. */
  readonly row: number;
  readonly rect: Rect;
}

/** One lane, as a band across the canvas. */
export interface LaidOutLane {
  readonly id: string;
  readonly name: string;
  /** Where the lane sits in the stack, counting from the top. */
  readonly index: number;
  readonly rect: Rect;
  readonly nodeIds: readonly string[];
}

/** Every rectangle the canvas needs to draw one flow. */
export interface FlowLayout {
  readonly lanes: readonly LaidOutLane[];
  readonly nodes: readonly LaidOutNode[];
  /** How many columns the flow is long. Zero for a candidate. */
  readonly columns: number;
  readonly size: { readonly width: number; readonly height: number };
}

/** The measurements the layout is drawn with. Every one has a default. */
export interface LayoutOptions {
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly columnGap?: number;
  readonly rowGap?: number;
  /** The room left for a lane's name, down the left of the canvas. */
  readonly laneHeaderWidth?: number;
  readonly lanePadding?: number;
  readonly laneGap?: number;
}

interface Measurements {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly laneHeaderWidth: number;
  readonly lanePadding: number;
  readonly laneGap: number;
}

export const DEFAULT_LAYOUT_OPTIONS: Measurements = {
  nodeWidth: 220,
  nodeHeight: 72,
  columnGap: 64,
  rowGap: 24,
  laneHeaderWidth: 160,
  lanePadding: 24,
  laneGap: 16,
};

/** Thrown when a document holds a contradiction the layout cannot draw a true answer from. */
export class LayoutError extends Error {
  override readonly name = 'LayoutError';
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Refuse a document the layout cannot place truthfully.
 *
 * The validator refuses every one of these at the seam, so a document that crossed it places. The
 * layout is called by name all the same, and each contradiction has a silent answer that is worse
 * than a refusal. A node in an undeclared lane has no band to sit in and would simply not be drawn,
 * leaving a canvas that reads as whole. Two lanes under one id both take that id's nodes, so every
 * node in it is placed twice and every reader of the layout counts it twice. Two nodes under one id
 * are one rectangle to everything downstream, so the reader clicks it and reaches either. An edge
 * that names a node nothing declares is drawn reaching for an end the canvas does not hold, and it
 * does worse than that to the ranking: a predecessor that is never ranked leaves every node below it
 * never ready, so the tie-break that exists to cut a genuine loop takes them in id order, and the
 * columns of the flow come back reordered. An edge that runs back to the node it left does the same,
 * being its own predecessor, and the canvas then drops it for having one end, so nothing is drawn to
 * show why the flow reordered. A reviewer cannot tell which part of a mostly true canvas is the wrong
 * part (ADR-0001), so the layout says so instead of drawing it.
 *
 * A flow that loops back is none of these. A retry or a poll has no topological order either, and the
 * ranking cuts it at a fixed point on purpose, so two nodes that lead to each other lay out.
 */
const requireDrawable = (document: FlowDocument): void => {
  const laneIds = new Set<string>();
  for (const lane of document.lanes) {
    if (laneIds.has(lane.id)) {
      throw new LayoutError(`two lanes claim the id '${lane.id}', so both bands hold its nodes`);
    }
    laneIds.add(lane.id);
  }
  const nodeIds = new Set<string>();
  for (const node of document.nodes) {
    if (nodeIds.has(node.id)) {
      throw new LayoutError(
        `two nodes claim the id '${node.id}', so one rectangle stands for both`,
      );
    }
    nodeIds.add(node.id);
    if (!laneIds.has(node.lane)) {
      throw new LayoutError(
        `the node '${node.id}' sits in the lane '${node.lane}', which the flow does not declare`,
      );
    }
  }
  for (const edge of document.edges) {
    if (edge.from === edge.to) {
      throw new LayoutError(
        `the edge on '${edge.from}' runs back to it, so it is its own unrankable predecessor`,
      );
    }
    for (const end of [edge.from, edge.to]) {
      if (!nodeIds.has(end)) {
        throw new LayoutError(
          `the edge from '${edge.from}' to '${edge.to}' names '${end}', which the flow does not declare`,
        );
      }
    }
  }
};

const measure = (options: LayoutOptions | undefined): Measurements => ({
  ...DEFAULT_LAYOUT_OPTIONS,
  ...options,
});

/** Lay one flow document out. */
export const layOutFlow = (document: FlowDocument, options?: LayoutOptions): FlowLayout => {
  requireDrawable(document);
  const metrics = measure(options);
  const ranks = rankNodes(document);
  const laneIds = document.lanes.map((lane) => lane.id);

  /** Nodes of one lane, ordered by rank and then by id, so array order never reaches the canvas. */
  const nodesOfLane = (laneId: string): readonly { id: string; rank: number }[] =>
    document.nodes
      .filter((node) => node.lane === laneId)
      .map((node) => ({ id: node.id, rank: ranks.get(node.id) ?? 0 }))
      .sort((left, right) =>
        left.rank === right.rank ? compare(left.id, right.id) : left.rank - right.rank,
      );

  const columns = Math.max(0, ...[...ranks.values()].map((rank) => rank + 1));
  const contentWidth =
    columns === 0
      ? metrics.nodeWidth
      : columns * metrics.nodeWidth + (columns - 1) * metrics.columnGap;
  const laneWidth = metrics.laneHeaderWidth + metrics.lanePadding * 2 + contentWidth;

  const lanes: LaidOutLane[] = [];
  const nodes: LaidOutNode[] = [];
  let top = 0;

  laneIds.forEach((laneId, index) => {
    const members = nodesOfLane(laneId);
    const rowOf = new Map<string, number>();
    const takenPerRank = new Map<number, number>();
    for (const member of members) {
      const row = takenPerRank.get(member.rank) ?? 0;
      takenPerRank.set(member.rank, row + 1);
      rowOf.set(member.id, row);
    }
    const rows = Math.max(1, ...[...takenPerRank.values()]);
    const laneHeight =
      metrics.lanePadding * 2 + rows * metrics.nodeHeight + (rows - 1) * metrics.rowGap;

    const declared = document.lanes[index];
    lanes.push({
      id: laneId,
      /** `laneIds` is read off `document.lanes`, so the lane at this index is always the one. */
      name: declared?.name ?? laneId,
      index,
      rect: { x: 0, y: top, width: laneWidth, height: laneHeight },
      nodeIds: members.map((member) => member.id),
    });

    for (const member of members) {
      const row = rowOf.get(member.id) ?? 0;
      nodes.push({
        id: member.id,
        lane: laneId,
        rank: member.rank,
        row,
        rect: {
          x:
            metrics.laneHeaderWidth +
            metrics.lanePadding +
            member.rank * (metrics.nodeWidth + metrics.columnGap),
          y: top + metrics.lanePadding + row * (metrics.nodeHeight + metrics.rowGap),
          width: metrics.nodeWidth,
          height: metrics.nodeHeight,
        },
      });
    }

    top += laneHeight + metrics.laneGap;
  });

  const height = lanes.length === 0 ? 0 : top - metrics.laneGap;
  return { lanes, nodes, columns, size: { width: laneWidth, height } };
};

/** Find one node's rectangle, or `undefined` when the layout does not hold it. */
export const laidOutNode = (layout: FlowLayout, id: string): LaidOutNode | undefined =>
  layout.nodes.find((node) => node.id === id);

/** Find one lane's band, or `undefined` when the layout does not hold it. */
export const laidOutLane = (layout: FlowLayout, id: string): LaidOutLane | undefined =>
  layout.lanes.find((lane) => lane.id === id);

/**
 * The placed nodes of one lane, in flow order. The layout already grouped and ordered them, so a
 * reader of the layout never has to join the two lists back together.
 */
export const laidOutNodesOfLane = (layout: FlowLayout, laneId: string): readonly LaidOutNode[] =>
  layout.nodes.filter((node) => node.lane === laneId);
