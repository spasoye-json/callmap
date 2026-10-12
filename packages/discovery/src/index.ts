/**
 * Discovery and curation as data (ADR-0005, ADR-0010): the prompt a discovery pass sends, the
 * proposed entry points it answers with, the curation rules that turn them into candidates, and
 * the cost math every pass shows first. Nothing here reads a file or calls a provider.
 */

export {
  addSpend,
  costOf,
  estimateOf,
  monthOf,
  parseSpend,
  serialiseSpend,
  spendIn,
} from './cost.ts';
export type { CostEstimate, MonthlySpend, SpendRecord, TokenPrice, TokenUsage } from './cost.ts';
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
