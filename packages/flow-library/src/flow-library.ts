/**
 * The flow library: every flow document a repo holds, and the picker a reader switches flows with.
 *
 * A candidate and a traced flow are the same kind of document at different stages (ADR-0005), so
 * the library holds both and says which is which. A traced flow can be opened on the canvas now; a
 * candidate is greyed out and needs a trace first, which is when the token cost is paid.
 */

import { isCandidate } from '@archmap/flow-document';
import type { EntryPoint, FlowDocument } from '@archmap/flow-document';
import type { StalenessMark, StalenessState } from '@archmap/staleness';

/** Whether a flow has been traced yet. */
export type FlowState = 'candidate' | 'traced';

/** One row of the library: what the picker needs to know about one flow. */
export interface FlowLibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly state: FlowState;
  /**
   * Whether the flow can be drawn on the canvas as it stands. A candidate is greyed out, and
   * opening it is what starts the trace that costs tokens (ADR-0005).
   */
  readonly openable: boolean;
  readonly entryPoint: EntryPoint;
  readonly nodeCount: number;
  readonly laneCount: number;
  readonly document: FlowDocument;
}

export interface FlowLibrary {
  /** Every flow the repo holds, in name order and then id order, so the picker never reshuffles. */
  readonly entries: readonly FlowLibraryEntry[];
  readonly size: number;
  has(id: string): boolean;
  get(id: string): FlowLibraryEntry | undefined;
  /** The documents, in the same order as the entries. */
  documents(): readonly FlowDocument[];
}

/** Thrown when a repo's flow documents cannot form a library. */
export class FlowLibraryError extends Error {
  override readonly name = 'FlowLibraryError';
}

const entryOf = (document: FlowDocument): FlowLibraryEntry => {
  const candidate = isCandidate(document);
  return {
    id: document.id,
    name: document.name,
    state: candidate ? 'candidate' : 'traced',
    openable: !candidate,
    entryPoint: document.entryPoint,
    nodeCount: document.nodes.length,
    laneCount: document.lanes.length,
    document,
  };
};

const byNameThenId = (left: FlowLibraryEntry, right: FlowLibraryEntry): number => {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

/** Gather a repo's flow documents into a library. Refuses two flows that claim one id. */
export const createFlowLibrary = (documents: readonly FlowDocument[]): FlowLibrary => {
  const byId = new Map<string, FlowLibraryEntry>();
  for (const document of documents) {
    if (byId.has(document.id)) {
      throw new FlowLibraryError(`two flow documents claim the id '${document.id}'`);
    }
    byId.set(document.id, entryOf(document));
  }
  const entries = [...byId.values()].sort(byNameThenId);
  return {
    entries,
    size: entries.length,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    documents: () => entries.map((entry) => entry.document),
  };
};

/** What the picker header counts. */
export interface FlowLibrarySummary {
  readonly total: number;
  readonly traced: number;
  readonly candidates: number;
}

export const summariseLibrary = (library: FlowLibrary): FlowLibrarySummary => {
  const traced = library.entries.filter((entry) => entry.state === 'traced').length;
  return { total: library.size, traced, candidates: library.size - traced };
};

/**
 * The badge the picker shows beside a flow: every way of reading that is not a checked pass. A
 * fresh flow and a candidate show none.
 */
export type FlowBadge = Exclude<StalenessState, 'candidate' | 'fresh'>;

export interface FlowPickerRow extends FlowLibraryEntry {
  /** How the flow reads, or nothing when marking has not reached it. */
  readonly staleness: StalenessState | null;
  readonly badge: FlowBadge | null;
}

const badgeOf = (state: StalenessState | null): FlowBadge | null => {
  switch (state) {
    case 'stale':
    case 'unstamped':
    case 'unknown':
      return state;
    default:
      return null;
  }
};

/**
 * Build the picker: every flow the library holds, with its staleness badge.
 *
 * A mark for a flow the library does not hold is ignored, and a flow no mark covers reads as
 * unmarked and shows no badge. Only a flow that reads as fresh is shown without a badge on purpose.
 */
export const buildFlowPicker = (
  library: FlowLibrary,
  marks: readonly StalenessMark[] = [],
): readonly FlowPickerRow[] => {
  const stateOf = new Map(marks.map((mark) => [mark.flowId, mark.state]));
  return library.entries.map((entry) => {
    const staleness = stateOf.get(entry.id) ?? null;
    return { ...entry, staleness, badge: badgeOf(staleness) };
  });
};
