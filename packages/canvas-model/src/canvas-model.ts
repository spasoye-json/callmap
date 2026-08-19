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
import { laidOutNodesOfLane, layOutFlow } from '@archmap/layout';
import type { Rect, LayoutOptions } from '@archmap/layout';

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
  readonly rect: Rect;
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

/** A drawn edge with everything but its id, which is settled across the whole canvas at the end. */
type DrawnEdge = Omit<CanvasEdge, 'id'>;

export interface CanvasLane {
  readonly id: string;
  readonly name: string;
  readonly rect: Rect;
  readonly collapsed: boolean;
  /** How many nodes the lane holds, collapsed or not. */
  readonly nodeCount: number;
  /**
   * The id the lane's band is drawn under when it is collapsed. This is the id, not a guess at one:
   * it already clears every node id of the document.
   */
  readonly summaryId: string;
  /**
   * The id the reader selects the lane by. A lane id, a node id and an edge id are three names off
   * the same AI pass, and only this one can move, so it is settled last against everything already
   * drawn. A lane id nothing else has taken reads exactly as it is.
   */
  readonly selectionId: string;
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

const LANE_SUMMARY_PREFIX = 'lane:';

/**
 * A prefix for this document's bands that no node id starts with, so a band can never be drawn under
 * a node's id.
 *
 * A node id comes off an AI pass, so a document may well hold one spelled `lane:backend`. Two canvas
 * nodes under one id would send the reader to the wrong panel and reroute an edge onto the wrong
 * end, which is the collision the composed edge id already guards against. The prefix grows by a
 * separator until no node id starts with it, which terminates because a prefix longer than the
 * longest node id cannot be the start of one.
 */
const laneSummaryPrefixOf = (document: FlowDocument): string => {
  let prefix = LANE_SUMMARY_PREFIX;
  while (document.nodes.some((node) => node.id.startsWith(prefix))) prefix += ':';
  return prefix;
};

/**
 * The id a lane's band is drawn under on this document's canvas.
 *
 * It reads the document because the id has to clear every node id in it, so the same lane of two
 * documents can be drawn under two ids. A reader of a built model does not need this: the id is on
 * the lane, as `summaryId`.
 */
export const laneSummaryId = (document: FlowDocument, laneId: string): string =>
  `${laneSummaryPrefixOf(document)}${laneId}`;

const composedIdOf = (edge: DrawnEdge): string => `${edge.from}->${edge.to}`;

/**
 * Settle the id of every drawn edge, so no two are drawn under one and none is drawn under a node's.
 *
 * An edge reads as `from->to`, which two different pairs can compose to when a node id holds the
 * separator, and which a node can be spelled as outright. The pair itself decides what merges; this
 * only decides what the reader clicks, so a composed id nothing else has is left exactly as it
 * reads, and a clash is settled by position and then by a suffix no other id has taken.
 */
const withEdgeIds = (
  drawn: readonly DrawnEdge[],
  drawnNodeIds: ReadonlySet<string>,
): readonly CanvasEdge[] => {
  const shares = new Map<string, number>();
  for (const edge of drawn) {
    const composed = composedIdOf(edge);
    shares.set(composed, (shares.get(composed) ?? 0) + 1);
  }
  const taken = new Set([...shares.keys(), ...drawnNodeIds]);
  return drawn.map((edge, position) => {
    const composed = composedIdOf(edge);
    if (shares.get(composed) === 1 && !drawnNodeIds.has(composed)) return { ...edge, id: composed };
    let candidate = `${composed}#${position}`;
    while (taken.has(candidate)) candidate += "'";
    taken.add(candidate);
    return { ...edge, id: candidate };
  });
};

/**
 * Settle the id each lane is selected by, so no lane sits behind something else the reader clicks.
 *
 * A node id is the document's own and a band id already clears every one of them, so by the time
 * this runs only the lane can move. A lane id nothing else has taken is left exactly as it reads,
 * and a clash grows by a mark no other id has taken. The settler is called once per lane, in the
 * order the document declares them, so what it hands back does not depend on which lane asks first.
 */
const laneIdSettler = (
  laneIds: readonly string[],
  claimed: ReadonlySet<string>,
): ((laneId: string) => string) => {
  const taken = new Set([...claimed, ...laneIds]);
  return (laneId) => {
    if (!claimed.has(laneId)) return laneId;
    let candidate = `${laneId}'`;
    while (taken.has(candidate)) candidate += "'";
    taken.add(candidate);
    return candidate;
  };
};

const inkOf = (kind: EdgeKind): EdgeInk => (kind === 'verified' ? 'solid' : 'dashed');

const boundingRect = (rects: readonly Rect[]): Rect | null => {
  const [first] = rects;
  if (first === undefined) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
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
  const prefix = laneSummaryPrefixOf(document);
  const summaryIdOf = (laneId: string): string => `${prefix}${laneId}`;

  /** A lane with nothing in it has nothing to hide, so collapsing it draws no band. */
  const collapsed = new Set(
    layout.lanes
      .filter((lane) => requestedCollapse.has(lane.id) && lane.nodeIds.length > 0)
      .map((lane) => lane.id),
  );

  const nodes: CanvasNode[] = [];
  for (const lane of layout.lanes) {
    const members = laidOutNodesOfLane(layout, lane.id);
    if (collapsed.has(lane.id)) {
      const rect = boundingRect(members.map((member) => member.rect));
      if (rect === null) continue;
      nodes.push({
        id: summaryIdOf(lane.id),
        kind: 'lane-summary',
        label: lane.name,
        shape: 'band',
        lane: lane.id,
        rect,
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
        rect: member.rect,
        anchor: { file: node.file, line: node.line },
        collapsedCount: 0,
      });
    }
  }

  const drawnEndpointOf = (nodeId: string): string => {
    const lane = nodesById.get(nodeId)?.lane;
    return lane !== undefined && collapsed.has(lane) ? summaryIdOf(lane) : nodeId;
  };

  /** A drawn edge before its id is settled, which cannot happen until every merge is done. */
  const edges: DrawnEdge[] = [];
  /**
   * Where each drawn pair landed, held per source, so two edges merge only when they truly run
   * between the same pair. Keying on the composed id would merge two different pairs whose ids
   * happen to compose to one string.
   */
  const positionOf = new Map<string, Map<string, number>>();
  const rememberPosition = (from: string, to: string, position: number): void => {
    const targets = positionOf.get(from);
    if (targets === undefined) positionOf.set(from, new Map([[to, position]]));
    else targets.set(to, position);
  };
  for (const edge of document.edges) {
    const from = drawnEndpointOf(edge.from);
    const to = drawnEndpointOf(edge.to);
    if (from === to) continue;
    const rerouted = from !== edge.from || to !== edge.to;
    const at = positionOf.get(from)?.get(to);
    if (at === undefined) {
      rememberPosition(from, to, edges.length);
      edges.push({
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

  /** The ids are settled once every edge has merged, so a merge cannot leave two under one id. */
  const drawnNodeIds = new Set(nodes.map((node) => node.id));
  const drawnEdges = withEdgeIds(edges, drawnNodeIds);
  /**
   * The lane is settled last, against every id already drawn, because it is the only one of the
   * three that can move: a node id is the document's own and an edge id is composed from two.
   */
  const settleLaneId = laneIdSettler(
    layout.lanes.map((lane) => lane.id),
    new Set([...drawnNodeIds, ...drawnEdges.map((edge) => edge.id)]),
  );

  const lanes: CanvasLane[] = layout.lanes.map((lane) => ({
    id: lane.id,
    name: lane.name,
    rect: lane.rect,
    collapsed: collapsed.has(lane.id),
    nodeCount: lane.nodeIds.length,
    summaryId: summaryIdOf(lane.id),
    selectionId: settleLaneId(lane.id),
  }));

  return {
    flowId: document.id,
    flowName: document.name,
    traced: isTracedFlow(document),
    lanes,
    nodes,
    edges: drawnEdges,
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

/**
 * Resolve what the reader clicked, so the panel beside the canvas knows what to show.
 *
 * A node, an edge and a lane are drawn under ids nothing else can take, so the order the three are
 * looked up in decides nothing: at most one of them answers.
 */
export const describeSelection = (model: CanvasModel, id: string): CanvasSelection | null => {
  const node = model.nodes.find((candidate) => candidate.id === id);
  if (node !== undefined) return { kind: 'node', node };
  const edge = model.edges.find((candidate) => candidate.id === id);
  if (edge !== undefined) return { kind: 'edge', edge, evidence: evidenceOf(edge) };
  const lane = model.lanes.find((candidate) => candidate.selectionId === id);
  if (lane !== undefined) return { kind: 'lane', lane };
  return null;
};
