/**
 * The deterministic layout: a validated flow document in, a set of boxes out.
 *
 * The same document always lays out to the same boxes, whatever order its nodes and edges were
 * written in, so a flow does not rearrange itself when it is saved and reopened. Lanes are bands
 * stacked in the order the document declares them, and the flow runs left to right across them.
 */

import type { FlowDocument } from '@archmap/flow-document';
import { rankNodes } from './rank.ts';

/** A rectangle in canvas space. */
export interface Box {
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
  readonly box: Box;
}

/** One lane, as a band across the canvas. */
export interface LaidOutLane {
  readonly id: string;
  readonly name: string;
  /** Where the lane sits in the stack, counting from the top. */
  readonly index: number;
  readonly box: Box;
  readonly nodeIds: readonly string[];
}

/** Every box the canvas needs to draw one flow. */
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

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const measure = (options: LayoutOptions | undefined): Measurements => ({
  ...DEFAULT_LAYOUT_OPTIONS,
  ...options,
});

/** Lay one flow document out. */
export const layOutFlow = (document: FlowDocument, options?: LayoutOptions): FlowLayout => {
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
      name: declared?.name ?? laneId,
      index,
      box: { x: 0, y: top, width: laneWidth, height: laneHeight },
      nodeIds: members.map((member) => member.id),
    });

    for (const member of members) {
      const row = rowOf.get(member.id) ?? 0;
      nodes.push({
        id: member.id,
        lane: laneId,
        rank: member.rank,
        row,
        box: {
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

/** Find one node's box, or `undefined` when the layout does not hold it. */
export const laidOutNode = (layout: FlowLayout, id: string): LaidOutNode | undefined =>
  layout.nodes.find((node) => node.id === id);

/** Find one lane's band, or `undefined` when the layout does not hold it. */
export const laidOutLane = (layout: FlowLayout, id: string): LaidOutLane | undefined =>
  layout.lanes.find((lane) => lane.id === id);
