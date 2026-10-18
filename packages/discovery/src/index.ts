/**
 * Discovery and curation as data (ADR-0005, ADR-0010): the prompt a discovery pass sends, the
 * proposed entry points it answers with, and the curation rules that turn them into candidates.
 * The cost math every pass shows first lives in `@archmap/cost`. Nothing here reads a file or
 * calls a provider.
 */

export { DISCOVERY_SYSTEM, discoveryPrompt, repoMaterial } from './prompt.ts';
export type { DiscoveryPrompt, DiscoveryPromptInput, SourceFile } from './prompt.ts';
export {
  curate,
  CurationError,
  EMPTY_CURATION,
  parseCuration,
  pendingProposals,
  serialiseCuration,
} from './curation.ts';
export type {
  AlreadyCurated,
  Curated,
  CuratedMap,
  CurationDecision,
  CurationErrorCode,
  CurationRecord,
  CurationRequest,
  PendingProposals,
} from './curation.ts';
export {
  candidateOf,
  DiscoveryError,
  FLOW_ID,
  PROPOSED_ENTRY_POINT_FIELDS,
  readDiscoveryAnswer,
  readProposedEntryPoints,
} from './proposals.ts';
export type {
  ProposalReading,
  ProposalRejection,
  ProposedEntryPoint,
  ReadProposalsOptions,
  RejectionCode,
} from './proposals.ts';
