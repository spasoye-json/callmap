/**
 * The commands of the lazy trace (ADR-0005). A trace command takes
 * back the documents an extract answered with, like every discovery command, and names the flow by
 * its id in the map file. Types only, so the UI imports them by type.
 */

import type { FlowDocument } from '@archmap/flow-document';
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import type { CostEstimate, EstimateResult, MonthlySpend } from './cost-protocol.ts';

/** Count what the trace of one candidate would cost, without running it. */
export interface EstimateTraceRequest {
  readonly command: 'estimate-trace';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
  readonly flowId: string;
}

/** Trace one candidate, validate the flow it reads, and save it over the candidate. */
export interface TraceRequest {
  readonly command: 'trace';
  readonly repo: string;
  readonly documents: readonly ReferenceGraphDocument[];
  readonly flowId: string;
}

export interface TraceResult {
  /** The traced flow, as saved in the map file. */
  readonly flow: FlowDocument;
  /** What this pass cost, read from the provider's usage. */
  readonly spent: CostEstimate;
  /** The month so far, this pass included. */
  readonly month: MonthlySpend;
}

export type TracePassRequest = EstimateTraceRequest | TraceRequest;

export interface TraceResults {
  readonly 'estimate-trace': EstimateResult;
  readonly trace: TraceResult;
}
