/**
 * The canvas model: what the canvas draws, derived from a flow document and its layout.
 *
 * The canvas only reads the flow document (ADR-0003), so every drawing decision is made here from
 * data and can be tested without a canvas in sight. Verified and inferred edges are drawn in
 * different inks and the evidence is readable on selection (ADR-0004).
 *
 * Collapsing a lane hides its nodes and draws the lane as one band over the space they held. The
 * layout does not change, so nothing else on the canvas moves under the reader.
 */

import { isInferredEdge, isTracedFlow } from '@archmap/flow-document';
import type {
  Boundary,
  EdgeKind,
  Evidence,
  FlowDocument,
  FlowEdge,
  NodeKind,
} from '@archmap/flow-document';
import { layOutFlow } from '@archmap/layout';
import type { Box, LayoutOptions } from '@archmap/layout';

/** The shape a node is drawn as. A collapsed lane is drawn as one band. */
export type NodeShape = 'rectangle' | 'diamond' | 'hexagon' | 'parallelogram' | 'band';

/** The ink an edge is drawn in: one for proven, one for proposed. */
export type EdgeInk = 'solid' | 'dashed';

/** A node kind, plus the stand-in a collapsed lane is drawn as. */
export type CanvasNodeKind = NodeKind | 'lane-summary';

/** Where a node points in the code, for click-to-editor. */
export interface Anchor {
  readonly file: string;
  readonly line: number;
}

export interface CanvasNode {
  readonly id: string;
  readonly kind: CanvasNodeKind;
  readonly label: string;
  readonly shape: NodeShape;
  readonly lane: string;
  readonly box: Box;
  /** Where the node points in the code, or nothing when it stands for a collapsed lane. */
  readonly anchor: Anchor | null;
  /** How many nodes a collapsed lane stands for. Zero for a node that is itself. */
  readonly collapsedCount: number;
}

export interface CanvasEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Inferred wins a merge, so a collapsed lane can never make a proposal look proven. */
  readonly kind: EdgeKind;
  readonly ink: EdgeInk;
  /** Whether an endpoint moved because the lane it sits in is collapsed. */
  readonly rerouted: boolean;
  /** The document edges this one stands for, in document order. */
  readonly sources: readonly FlowEdge[];
}

export interface CanvasLane {
  readonly id: string;
  readonly name: string;
  readonly box: Box;
  readonly collapsed: boolean;
  /** How many nodes the lane holds, collapsed or not. */
  readonly nodeCount: number;
}

export interface CanvasModel {
  readonly flowId: string;
  readonly flowName: string;
  /** Whether the flow has been traced. A candidate draws as an empty canvas. */
  readonly traced: boolean;
  readonly lanes: readonly CanvasLane[];
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
  readonly size: { readonly width: number; readonly height: number };
}

export interface CanvasModelOptions {
  /** The lanes the reader has collapsed. A lane id the flow does not hold is ignored. */
  readonly collapsedLanes?: readonly string[];
  readonly layout?: LayoutOptions;
}

const SHAPES: Readonly<Record<NodeKind, NodeShape>> = {
  step: 'rectangle',
  decision: 'diamond',
  error: 'hexagon',
  'side-effect': 'parallelogram',
};

/** The stand-in id for a collapsed lane, kept apart from any node id by its prefix. */
export const laneSummaryId = (laneId: string): string => `lane:${laneId}`;

const inkOf = (kind: EdgeKind): EdgeInk => (kind === 'verified' ? 'solid' : 'dashed');

const boundingBox = (boxes: readonly Box[]): Box | null => {
  const [first] = boxes;
  if (first === undefined) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Build the canvas model of one flow document. */
export const buildCanvasModel = (
  document: FlowDocument,
  options: CanvasModelOptions = {},
): CanvasModel => {
  const layout = layOutFlow(document, options.layout);
  const requestedCollapse = new Set(options.collapsedLanes ?? []);
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));

  const lanes: CanvasLane[] = layout.lanes.map((lane) => ({
    id: lane.id,
    name: lane.name,
    box: lane.box,
    collapsed: requestedCollapse.has(lane.id) && lane.nodeIds.length > 0,
    nodeCount: lane.nodeIds.length,
  }));
  const collapsed = new Set(lanes.filter((lane) => lane.collapsed).map((lane) => lane.id));

  const nodes: CanvasNode[] = [];
  for (const lane of layout.lanes) {
    const members = lane.nodeIds
      .map((id) => layout.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => node !== undefined);
    if (collapsed.has(lane.id)) {
      const box = boundingBox(members.map((member) => member.box));
      if (box === null) continue;
      nodes.push({
        id: laneSummaryId(lane.id),
        kind: 'lane-summary',
        label: lane.name,
        shape: 'band',
        lane: lane.id,
        box,
        anchor: null,
        collapsedCount: members.length,
      });
      continue;
    }
    for (const member of members) {
      const node = nodesById.get(member.id);
      if (node === undefined) continue;
      nodes.push({
        id: node.id,
        kind: node.kind,
        label: node.label,
        shape: SHAPES[node.kind],
        lane: node.lane,
        box: member.box,
        anchor: { file: node.file, line: node.line },
        collapsedCount: 0,
      });
    }
  }

  const drawnEndpointOf = (nodeId: string): string => {
    const lane = nodesById.get(nodeId)?.lane;
    return lane !== undefined && collapsed.has(lane) ? laneSummaryId(lane) : nodeId;
  };

  const edges: CanvasEdge[] = [];
  const positionOf = new Map<string, number>();
  for (const edge of document.edges) {
    const from = drawnEndpointOf(edge.from);
    const to = drawnEndpointOf(edge.to);
    if (from === to) continue;
    const id = `${from}->${to}`;
    const rerouted = from !== edge.from || to !== edge.to;
    const at = positionOf.get(id);
    if (at === undefined) {
      positionOf.set(id, edges.length);
      edges.push({
        id,
        from,
        to,
        kind: edge.kind,
        ink: inkOf(edge.kind),
        rerouted,
        sources: [edge],
      });
      continue;
    }
    const existing = edges[at];
    if (existing === undefined) continue;
    const kind: EdgeKind =
      existing.kind === 'inferred' || edge.kind === 'inferred' ? 'inferred' : 'verified';
    edges[at] = {
      ...existing,
      kind,
      ink: inkOf(kind),
      rerouted: existing.rerouted || rerouted,
      sources: [...existing.sources, edge],
    };
  }

  return {
    flowId: document.id,
    flowName: document.name,
    traced: isTracedFlow(document),
    lanes,
    nodes,
    edges,
    size: layout.size,
  };
};

/** The evidence readable on selecting an edge. Empty for a verified edge, which needs none. */
export const evidenceOf = (edge: CanvasEdge): readonly Evidence[] =>
  edge.sources.filter(isInferredEdge).map((source) => source.evidence);

/** The boundaries an edge crosses, in source order. Empty for a verified edge. */
export const boundariesOf = (edge: CanvasEdge): readonly Boundary[] =>
  edge.sources.filter(isInferredEdge).map((source) => source.boundary);

export type CanvasSelection =
  | { readonly kind: 'node'; readonly node: CanvasNode }
  | { readonly kind: 'edge'; readonly edge: CanvasEdge; readonly evidence: readonly Evidence[] }
  | { readonly kind: 'lane'; readonly lane: CanvasLane };

/** Resolve what the reader clicked, so the panel beside the canvas knows what to show. */
export const describeSelection = (model: CanvasModel, id: string): CanvasSelection | null => {
  const node = model.nodes.find((candidate) => candidate.id === id);
  if (node !== undefined) return { kind: 'node', node };
  const edge = model.edges.find((candidate) => candidate.id === id);
  if (edge !== undefined) return { kind: 'edge', edge, evidence: evidenceOf(edge) };
  const lane = model.lanes.find((candidate) => candidate.id === id);
  if (lane !== undefined) return { kind: 'lane', lane };
  return null;
};
