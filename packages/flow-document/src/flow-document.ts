/**
 * The flow document: the record of one flow as data, and the only seam between the pipeline and
 * the canvas (ADR-0003). Producers only write it, the canvas only reads it, and the validator in
 * `validate.ts` sits in the middle.
 */

/** What a node is: a step, a decision, an error exit, or a side effect. */
export type NodeKind = 'step' | 'decision' | 'error' | 'side-effect';

/** Where a flow starts: a route, a screen, or an event listener. */
export type EntryPointKind = 'route' | 'screen' | 'event-listener';

/** The kind of hop an inferred edge crosses. */
export type Boundary = 'http' | 'event';

/** The two edge classes: one the reference graph proves, one it cannot. */
export type EdgeKind = 'verified' | 'inferred';

export const NODE_KINDS: readonly NodeKind[] = ['step', 'decision', 'error', 'side-effect'];
export const ENTRY_POINT_KINDS: readonly EntryPointKind[] = ['route', 'screen', 'event-listener'];
export const BOUNDARIES: readonly Boundary[] = ['http', 'event'];
export const EDGE_KINDS: readonly EdgeKind[] = ['verified', 'inferred'];

/** The place where a flow starts, anchored to a file and a line. */
export interface EntryPoint {
  readonly kind: EntryPointKind;
  readonly file: string;
  readonly line: number;
}

/** One side of a process boundary that a flow crosses. */
export interface Lane {
  readonly id: string;
  readonly name: string;
}

/** One point in a flow, anchored to a file and a line. */
export interface FlowNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly lane: string;
  readonly file: string;
  readonly line: number;
}

/** The quoted match that proposes an inferred edge, and where it was read. */
export interface Evidence {
  readonly quote: string;
  readonly file: string;
  readonly line: number;
}

/** An edge the reference graph proves. */
export interface VerifiedEdge {
  readonly kind: 'verified';
  readonly from: string;
  readonly to: string;
}

/** An edge no static reference can prove, so it carries the evidence that proposes it. */
export interface InferredEdge {
  readonly kind: 'inferred';
  readonly from: string;
  readonly to: string;
  readonly boundary: Boundary;
  readonly evidence: Evidence;
}

/** A link from one node to the next in a flow. */
export type FlowEdge = VerifiedEdge | InferredEdge;

/** The record of one flow: its entry point, its lanes, its nodes, and its edges. */
export interface FlowDocument {
  readonly id: string;
  readonly name: string;
  readonly entryPoint: EntryPoint;
  readonly lanes: readonly Lane[];
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

/** The fields the validator accepts, per level. Anything else is smuggled and rejected. */
export const FLOW_DOCUMENT_FIELDS: readonly string[] = [
  'id',
  'name',
  'entryPoint',
  'lanes',
  'nodes',
  'edges',
];
export const ENTRY_POINT_FIELDS: readonly string[] = ['kind', 'file', 'line'];
export const LANE_FIELDS: readonly string[] = ['id', 'name'];
export const NODE_FIELDS: readonly string[] = ['id', 'kind', 'label', 'lane', 'file', 'line'];
export const EVIDENCE_FIELDS: readonly string[] = ['quote', 'file', 'line'];
export const VERIFIED_EDGE_FIELDS: readonly string[] = ['kind', 'from', 'to'];
export const INFERRED_EDGE_FIELDS: readonly string[] = [
  'kind',
  'from',
  'to',
  'boundary',
  'evidence',
];

/**
 * A candidate: a flow that is named and anchored to an entry point but not yet traced. It carries
 * no nodes and no edges (ADR-0005).
 *
 * This reads the nodes alone, and for a document that came through the validator the two conditions
 * are one: a flow with no nodes carrying edges is refused as `candidate-has-edges`. For anything
 * hand-built that never crossed the seam, reading it as a candidate is the safe way round, because a
 * candidate cannot be stamped: the alternative would call a document with no nodes a traced flow and
 * let it be stamped against an empty anchor set, and an empty stamp is one nobody checked.
 */
export const isCandidate = (document: FlowDocument): boolean => document.nodes.length === 0;

/** A traced flow: a flow whose nodes and edges are read from the code. */
export const isTracedFlow = (document: FlowDocument): boolean => !isCandidate(document);

/** Narrow an edge to the inferred class. */
export const isInferredEdge = (edge: FlowEdge): edge is InferredEdge => edge.kind === 'inferred';

/** Narrow an edge to the verified class. */
export const isVerifiedEdge = (edge: FlowEdge): edge is VerifiedEdge => edge.kind === 'verified';
