/**
 * The commands of discovery, curation, cost, and the map file (ADR-0005, ADR-0010). Each one that
 * needs the reference graph takes back the documents an extract answered with, so the graph is
 * never built twice and a command consumes and returns documents only. Types only, like
 * `protocol.ts`, so the UI imports them by type.
 */

import type {
  AlreadyCurated,
  CostEstimate,
  CurationRecord,
  MonthlySpend,
  ProposalRejection,
  ProposedEntryPoint,
} from '@archmap/discovery';
import type { FlowDocument } from '@archmap/flow-document';
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import type { StalenessMark } from '@archmap/staleness';
import type { RefusedFlowFile } from './map-file.ts';

/**
 * Read the map file the repo commits: its flow documents and its curation record, with every flow
 * marked against the files as they stand now.
 */
export interface MapRequest {
  readonly command: 'map';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
}

export interface MapResult {
  /** Every flow document the validator accepted, candidates and traced flows, in id order. */
  readonly flows: readonly FlowDocument[];
  readonly refused: readonly RefusedFlowFile[];
  readonly curation: CurationRecord;
  /** One mark per flow, in id order. A stale flow is marked here and never traced again. */
  readonly marks: readonly StalenessMark[];
}

/** Count what a discovery pass would cost, without running it. */
export interface EstimateDiscoveryRequest {
  readonly command: 'estimate-discovery';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
}

export interface EstimateResult {
  readonly estimate: CostEstimate;
  /** The month so far, before this pass. */
  readonly month: MonthlySpend;
}

/** Run the discovery pass and answer with the proposals still to curate. */
export interface DiscoverRequest {
  readonly command: 'discover';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
}

export interface DiscoverResult {
  /** The proposals the validator anchored and no earlier round decided, in the order proposed. */
  readonly proposals: readonly ProposedEntryPoint[];
  /** The proposals the validator turned away. They never reach curation. */
  readonly rejections: readonly ProposalRejection[];
  readonly alreadyCurated: readonly AlreadyCurated[];
  /** What this pass cost, read from the provider's usage. */
  readonly spent: CostEstimate;
  /** The month so far, this pass included. */
  readonly month: MonthlySpend;
}

/** Accept some proposals as candidates and reject others, and write both into the map file. */
export interface CurateRequest {
  readonly command: 'curate';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
  readonly accept: readonly ProposedEntryPoint[];
  readonly reject: readonly ProposedEntryPoint[];
}

/** The map file as it stands after the round. */
export type CurateResult = MapResult;

export interface AccountRequest {
  readonly command: 'account';
}

/** Store the reader's own provider key, outside every repo. */
export interface SetKeyRequest {
  readonly command: 'set-key';
  readonly key: string;
}

export interface AccountResult {
  readonly keyStored: boolean;
  readonly month: MonthlySpend;
}

export type DiscoveryRequest =
  | MapRequest
  | EstimateDiscoveryRequest
  | DiscoverRequest
  | CurateRequest
  | AccountRequest
  | SetKeyRequest;

export interface DiscoveryResults {
  readonly map: MapResult;
  readonly 'estimate-discovery': EstimateResult;
  readonly discover: DiscoverResult;
  readonly curate: CurateResult;
  readonly account: AccountResult;
  readonly 'set-key': AccountResult;
}
