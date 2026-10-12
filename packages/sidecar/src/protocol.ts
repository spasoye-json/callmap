/**
 * The sidecar command surface: the one seam between the UI and everything that reads a repo
 * (ADR-0006). Every request and every response is plain JSON, so the shell can carry it as one
 * line of text and a test can drive it with no window and no process.
 *
 * This module holds types only, so the UI imports it by type and pulls no host code into the
 * browser bundle.
 */

import type { ReferenceGraphDocument } from '@archmap/reference-graph';

/** Point the sidecar at a repo, under scope globs, and learn which languages it holds there. */
export interface OpenRequest {
  readonly command: 'open';
  readonly repo: string;
  readonly scope: readonly string[];
}

export interface OpenResult {
  /** The repo as an absolute path, which every later command takes back unchanged. */
  readonly repo: string;
  readonly scope: readonly string[];
  /** Every language some registered extractor claims a file in scope for, in name order. */
  readonly languages: readonly string[];
}

/**
 * Run the extractor of each language an open detected. It takes the open result back, so a
 * language the reader dropped is not extracted and a language nothing registered is refused.
 */
export interface ExtractRequest {
  readonly command: 'extract';
  readonly repo: string;
  readonly scope: readonly string[];
  readonly languages: readonly string[];
}

export interface LanguageSummary {
  readonly language: string;
  readonly files: number;
  readonly edges: number;
}

/** The counts a reader sees when a repo opens, read from the merged reference graph. */
export interface ReferenceGraphSummary {
  readonly files: number;
  readonly edges: number;
  readonly languages: readonly LanguageSummary[];
}

export interface ExtractResult {
  /** One reference graph document per extractor run, each as the extractor emitted it. */
  readonly documents: readonly ReferenceGraphDocument[];
  readonly summary: ReferenceGraphSummary;
}

export type SidecarRequest = OpenRequest | ExtractRequest;

export type SidecarErrorCode =
  | 'malformed-request'
  | 'unknown-command'
  | 'repo-not-found'
  | 'unknown-language'
  | 'extractor-failed'
  | 'graph-refused'
  | 'internal-error';

export interface SidecarError {
  readonly code: SidecarErrorCode;
  readonly message: string;
}

export type SidecarResponse<Result> =
  | { readonly ok: true; readonly result: Result }
  | { readonly ok: false; readonly error: SidecarError };

/** What each command answers with, so a client is typed by the command it sends. */
export interface SidecarResults {
  readonly open: OpenResult;
  readonly extract: ExtractResult;
}
