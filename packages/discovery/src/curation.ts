/**
 * Curation: the human half of ADR-0010. The AI proposes, the validator anchors, and a person
 * accepts or rejects each proposal. An accepted proposal becomes a candidate flow document. A
 * rejected one is recorded, so the next discovery pass does not offer it again. Both land in the
 * committed map file, so a teammate inherits the decisions (ADR-0007).
 */

import { ENTRY_POINT_KINDS } from '@archmap/flow-document';
import type { EntryPointKind, FlowDocument } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { candidateOf, PROPOSED_ENTRY_POINT_FIELDS, readProposedEntryPoints } from './proposals.ts';
import type { ProposedEntryPoint } from './proposals.ts';

/** The decisions the map file keeps beside its flow documents. An accepted proposal is its candidate. */
export interface CurationRecord {
  readonly rejected: readonly ProposedEntryPoint[];
}

export const EMPTY_CURATION: CurationRecord = { rejected: [] };

/** What curation reads from the map file: the flows it holds and the rejections it recorded. */
export interface CuratedMap {
  readonly flows: readonly FlowDocument[];
  readonly curation: CurationRecord;
}

export type CurationDecision = 'accepted' | 'rejected';

export interface AlreadyCurated {
  readonly id: string;
  readonly decision: CurationDecision;
}

export interface PendingProposals {
  readonly pending: readonly ProposedEntryPoint[];
  readonly alreadyCurated: readonly AlreadyCurated[];
}

export interface CurationRequest {
  readonly accept: readonly ProposedEntryPoint[];
  readonly reject: readonly ProposedEntryPoint[];
}

export interface Curated {
  /** The candidates to write into the map file, one per accepted proposal. */
  readonly candidates: readonly FlowDocument[];
  /** The whole curation record after this round, earlier rejections kept. */
  readonly curation: CurationRecord;
}

export type CurationErrorCode = 'proposal-refused' | 'already-curated' | 'malformed-curation';

export class CurationError extends Error {
  override readonly name = 'CurationError';
  readonly code: CurationErrorCode;

  constructor(code: CurationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const decisionOf = (id: string, map: CuratedMap): CurationDecision | null => {
  if (map.flows.some((flow) => flow.id === id)) return 'accepted';
  if (map.curation.rejected.some((proposal) => proposal.id === id)) return 'rejected';
  return null;
};

const byId = (a: ProposedEntryPoint, b: ProposedEntryPoint): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The proposals a person still has to decide on. A flow id the map already carries was decided in
 * an earlier round, and a traced flow under it cost real tokens, so it is held back, not offered.
 */
export const pendingProposals = (
  proposals: readonly ProposedEntryPoint[],
  map: CuratedMap,
): PendingProposals => {
  const pending: ProposedEntryPoint[] = [];
  const alreadyCurated: AlreadyCurated[] = [];
  for (const proposal of proposals) {
    const decision = decisionOf(proposal.id, map);
    if (decision === null) pending.push(proposal);
    else alreadyCurated.push({ id: proposal.id, decision });
  }
  return { pending, alreadyCurated };
};

/**
 * Apply one round of decisions. Every proposal is read again by the validator, because a decision
 * comes back from the UI and only what the reference graph anchors may become a candidate.
 */
export const curate = (
  request: CurationRequest,
  map: CuratedMap,
  options: { readonly referenceGraph: ReferenceGraph },
): Curated => {
  const decided = [...request.accept, ...request.reject];
  const reading = readProposedEntryPoints({ proposedEntryPoints: decided }, options);
  if (reading.rejections.length > 0) {
    throw new CurationError(
      'proposal-refused',
      reading.rejections.map((rejection) => `${rejection.at}: ${rejection.message}`).join('; '),
    );
  }
  for (const proposal of decided) {
    const decision = decisionOf(proposal.id, map);
    if (decision !== null) {
      throw new CurationError(
        'already-curated',
        `flow id ${proposal.id} was already ${decision} in an earlier round`,
      );
    }
  }
  return {
    candidates: request.accept.map(candidateOf),
    curation: { rejected: [...map.curation.rejected, ...request.reject].sort(byId) },
  };
};

/** The curation record as the map file holds it: sorted, so a diff shows only what changed. */
export const serialiseCuration = (record: CurationRecord): string =>
  `${JSON.stringify({ rejected: [...record.rejected].sort(byId) }, null, 2)}\n`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnly = (value: Record<string, unknown>, fields: readonly string[]): boolean =>
  Object.keys(value).every((field) => fields.includes(field)) &&
  fields.every((field) => field in value);

/**
 * A recorded rejection is read for its shape only. Its file may be gone since, and that is fine: a
 * rejection anchors nothing, it only stops the same proposal from coming back.
 */
const isProposedEntryPoint = (value: unknown): value is ProposedEntryPoint => {
  if (!isRecord(value) || !hasOnly(value, PROPOSED_ENTRY_POINT_FIELDS)) return false;
  const entryPoint = value['entryPoint'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    isRecord(entryPoint) &&
    hasOnly(entryPoint, ['kind', 'file', 'line']) &&
    ENTRY_POINT_KINDS.includes(entryPoint['kind'] as EntryPointKind) &&
    typeof entryPoint['file'] === 'string' &&
    Number.isInteger(entryPoint['line'])
  );
};

export const parseCuration = (text: string): CurationRecord => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_error) {
    throw new CurationError('malformed-curation', 'the curation record is not JSON');
  }
  if (!isRecord(value) || !hasOnly(value, ['rejected']) || !Array.isArray(value['rejected'])) {
    throw new CurationError('malformed-curation', "the curation record holds only 'rejected'");
  }
  const rejected: unknown[] = value['rejected'];
  if (!rejected.every(isProposedEntryPoint)) {
    throw new CurationError(
      'malformed-curation',
      'every rejection is a proposed entry point with an id, a name, and an entry point',
    );
  }
  return { rejected: [...rejected].sort(byId) };
};
