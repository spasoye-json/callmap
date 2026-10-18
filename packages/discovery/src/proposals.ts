/**
 * Proposed entry points: what the discovery pass answers with, and the rules that keep a
 * hallucinated one out of the map (ADR-0010). The AI proposes, the validator anchors: every
 * proposal is built into the candidate it would become and read by the same validator every flow
 * document passes (ADR-0001), so a proposal at a file the reference graph does not know never
 * reaches curation.
 */

import { validateFlowDocument } from '@archmap/flow-document';
import type { EntryPoint, FlowDocument, ValidationCode } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';

/** One entry point the discovery pass proposes, named for the use case it starts. */
export interface ProposedEntryPoint {
  readonly id: string;
  readonly name: string;
  readonly entryPoint: EntryPoint;
}

export const PROPOSED_ENTRY_POINT_FIELDS: readonly string[] = ['id', 'name', 'entryPoint'];

/** A flow id names the file its document is saved under, so it is a kebab-case slug and nothing else. */
export const FLOW_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RejectionCode = ValidationCode | 'invalid-flow-id' | 'duplicate-flow-id';

/** One proposal the validator turned away, addressed at the field that caused it. */
export interface ProposalRejection {
  readonly at: string;
  /** The id the proposal claimed, when it claimed a string, so a reader can tell which it was. */
  readonly id: string | null;
  readonly code: RejectionCode;
  readonly message: string;
}

export interface ProposalReading {
  readonly proposals: readonly ProposedEntryPoint[];
  readonly rejections: readonly ProposalRejection[];
}

export interface ReadProposalsOptions {
  readonly referenceGraph: ReferenceGraph;
}

/** Thrown when an answer cannot be read at all, which is the pass failing, not one proposal. */
export class DiscoveryError extends Error {
  override readonly name = 'DiscoveryError';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The candidate a proposal becomes once a human accepts it: no lanes, no nodes, no edges (ADR-0005). */
export const candidateOf = (proposal: ProposedEntryPoint): FlowDocument => ({
  id: proposal.id,
  name: proposal.name,
  entryPoint: proposal.entryPoint,
  lanes: [],
  nodes: [],
  edges: [],
});

/**
 * Read one proposal. Its own fields are checked first, then the candidate it would become goes
 * through the flow document validator, so the anchor rules live in one place.
 */
const readProposal = (
  value: unknown,
  at: string,
  options: ReadProposalsOptions,
): { proposal: ProposedEntryPoint } | { rejections: readonly ProposalRejection[] } => {
  if (!isRecord(value)) {
    return {
      rejections: [
        { at, id: null, code: 'not-an-object', message: 'a proposed entry point is an object' },
      ],
    };
  }
  const id = typeof value['id'] === 'string' ? value['id'] : null;
  const unknown = Object.keys(value).filter(
    (field) => !PROPOSED_ENTRY_POINT_FIELDS.includes(field),
  );
  if (unknown.length > 0) {
    return {
      rejections: unknown.map((field) => ({
        at: `${at}.${field}`,
        id,
        code: 'unknown-field',
        message: `'${field}' is not a field of a proposed entry point`,
      })),
    };
  }
  if (id !== null && !FLOW_ID.test(id)) {
    return {
      rejections: [
        {
          at: `${at}.id`,
          id,
          code: 'invalid-flow-id',
          message: `${JSON.stringify(id)} is not a kebab-case slug, and a flow id names a file`,
        },
      ],
    };
  }
  const validation = validateFlowDocument(
    { ...value, lanes: [], nodes: [], edges: [] },
    { referenceGraph: options.referenceGraph },
  );
  if (!validation.ok) {
    return {
      rejections: validation.errors.map((error) => ({
        at: error.path === '' ? at : `${at}.${error.path}`,
        id,
        code: error.code,
        message: error.message,
      })),
    };
  }
  const { document } = validation;
  return { proposal: { id: document.id, name: document.name, entryPoint: document.entryPoint } };
};

/** Read the proposals of a parsed answer, keeping each one the validator accepts. */
export const readProposedEntryPoints = (
  answer: unknown,
  options: ReadProposalsOptions,
): ProposalReading => {
  const list = isRecord(answer) ? answer['proposedEntryPoints'] : undefined;
  if (!Array.isArray(list)) {
    throw new DiscoveryError('the discovery answer holds no list of proposedEntryPoints');
  }
  const proposals: ProposedEntryPoint[] = [];
  const rejections: ProposalRejection[] = [];
  const taken = new Set<string>();
  list.forEach((value: unknown, position) => {
    const at = `proposedEntryPoints[${String(position)}]`;
    const read = readProposal(value, at, options);
    if ('rejections' in read) {
      rejections.push(...read.rejections);
      return;
    }
    if (taken.has(read.proposal.id)) {
      rejections.push({
        at: `${at}.id`,
        id: read.proposal.id,
        code: 'duplicate-flow-id',
        message: `flow id ${read.proposal.id} is proposed twice`,
      });
      return;
    }
    taken.add(read.proposal.id);
    proposals.push(read.proposal);
  });
  return { proposals, rejections };
};

/** Parse the text a provider answered with, then read its proposals. */
export const readDiscoveryAnswer = (
  text: string,
  options: ReadProposalsOptions,
): ProposalReading => {
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new DiscoveryError(`the discovery answer is not JSON: ${reason}`);
  }
  return readProposedEntryPoints(answer, options);
};
