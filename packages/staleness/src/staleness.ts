/**
 * Staleness: a content hash of the anchor set, not a git diff (ADR-0008).
 *
 * A traced flow is stamped with the hash of every file in its anchor set at trace time, and it
 * reads as stale when any anchored file no longer hashes to its stamped value, or is gone. The
 * review scene is a reader judging a change before it merges, so the change is in the working tree
 * and has no commit yet: a content hash sees it, a commit range does not.
 *
 * Nothing here reads a file. The host hands in a snapshot of the hashes it read, so the rules can
 * be tested without a repo and the core stays free of a filesystem.
 */

import { isCandidate } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';

/** The content hash of one file, as the host computed it. */
export type FileHash = string;

/** The hash of every file in one flow's anchor set, recorded at trace time. */
export type AnchorStamp = Readonly<Record<string, FileHash>>;

/** The whole of `flow-anchors.json`: one stamp per stamped flow, keyed by flow id. */
export type AnchorStore = Readonly<Record<string, AnchorStamp>>;

/** What the host read from the repo, or why it could not. */
export type RepoSnapshot =
  | { readonly readable: true; readonly hashes: Readonly<Record<string, FileHash>> }
  | { readonly readable: false; readonly reason: string };

/**
 * How a flow reads.
 *
 * A traced flow with no stamp reads as unstamped and a repo that cannot be read reads as unknown.
 * Neither reads as fresh, so a missing stamp can never be mistaken for a checked one.
 */
export type StalenessState = 'candidate' | 'unstamped' | 'unknown' | 'fresh' | 'stale';

/**
 * Why a flow reads as stale. The stamp is compared in both directions: a file the document gained
 * since the stamp has never been checked, and a file the stamp holds that the document no longer
 * names means the trace was edited after it was stamped.
 */
export type StalenessCode = 'changed' | 'gone' | 'gained' | 'dropped';

export interface StalenessReason {
  readonly code: StalenessCode;
  readonly file: string;
}

export interface StalenessMark {
  readonly flowId: string;
  readonly state: StalenessState;
  /** Empty unless the flow reads as stale. Ordered by file, so a mark reads the same every time. */
  readonly reasons: readonly StalenessReason[];
}

/** Thrown when a stamp is asked for something a stamp cannot claim. */
export class StalenessError extends Error {
  override readonly name = 'StalenessError';
}

/** A snapshot of a repo the host could read. */
export const repoSnapshot = (hashes: Readonly<Record<string, FileHash>>): RepoSnapshot => ({
  readable: true,
  hashes,
});

/** A repo the host could not read, so no flow in it can read as fresh. */
export const unreadableRepo = (reason: string): RepoSnapshot => ({ readable: false, reason });

/**
 * Every file a flow's nodes point at, in path order. A candidate points at none, so nothing in a
 * working tree can make one stale; only a stamp it should never have held does that.
 *
 * CONTEXT.md makes the anchor set every file *and line* a flow's nodes point at, and this returns the
 * files alone, because a content hash is of a file. Nothing is lost by it: a line cannot change
 * without changing the file that holds it, so the file's hash already sees every edit to every line
 * the flow anchors. The lines are what the anchor set is *of*; the files are what it is *checked by*.
 */
export const anchorSetOf = (document: FlowDocument): readonly string[] =>
  [...new Set(document.nodes.map((node) => node.file))].sort();

/**
 * One value of a record, read by own property.
 *
 * A stamp, a store, and a snapshot are all plain objects keyed by names a producer chose: flow ids
 * and file paths. A key that happens to name something `Object.prototype` carries, such as
 * `toString` or `__proto__`, must read as absent, or the core would stamp an inherited function
 * where a hash belongs and read a file the repo does not hold as merely changed.
 */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/**
 * Build a record from its entries, so a key that names something `Object.prototype` carries lands
 * as an own property rather than reaching the prototype of the record it is written into.
 */
const recordOf = <T>(entries: readonly (readonly [string, T])[]): Record<string, T> =>
  Object.fromEntries(entries);

/** The stamp of one flow, or nothing when the flow has never been stamped. */
export const stampOf = (store: AnchorStore, flowId: string): AnchorStamp | undefined =>
  own(store, flowId);

/**
 * Build the stamp of one traced flow from a snapshot of the repo as it is now.
 *
 * Refuses a candidate, which has read no files, and refuses a repo the host could not read or that
 * is missing an anchored file, because a stamp claims "these are the files I read".
 */
export const stampAnchors = (document: FlowDocument, snapshot: RepoSnapshot): AnchorStamp => {
  if (isCandidate(document)) {
    throw new StalenessError(
      `'${document.id}' is a candidate, so it has read no files and there is nothing to stamp`,
    );
  }
  if (!snapshot.readable) {
    throw new StalenessError(
      `the repo could not be read, so nothing can be stamped: ${snapshot.reason}`,
    );
  }
  const stamped: [string, FileHash][] = [];
  for (const file of anchorSetOf(document)) {
    const hash = own(snapshot.hashes, file);
    if (hash === undefined) {
      throw new StalenessError(`'${document.id}' anchors '${file}', which the repo does not hold`);
    }
    stamped.push([file, hash]);
  }
  return recordOf(stamped);
};

/**
 * Index a repo's flow documents by id, refusing two that claim one.
 *
 * A stamp claims "these are the files I read", and a mark says whether that still holds, so both
 * are about one trace under one id. Taking whichever of two documents came first would stamp or mark
 * one flow's anchor set under the other's id, and neither the stamp nor the mark that came back was
 * ever of that trace. A wrong stamp reads as fresh and a doubled mark lets the picker be handed a
 * stale reading covered by a fresh one, which is what a badge exists to prevent.
 */
const documentsById = (documents: readonly FlowDocument[]): Map<string, FlowDocument> => {
  const byId = new Map<string, FlowDocument>();
  for (const document of documents) {
    if (byId.has(document.id)) {
      throw new StalenessError(`two flow documents claim the id '${document.id}'`);
    }
    byId.set(document.id, document);
  }
  return byId;
};

export interface StampOptions {
  /** Replace a stamp a flow already holds. Re-stamping is always a deliberate act. */
  readonly restamp?: boolean;
}

/**
 * Stamp the named flows and return the new store.
 *
 * Stamping takes the flow ids and refuses to run without one: a blanket stamp would mint a fresh
 * mark for a trace nobody checked, which is exactly what staleness exists to prevent. A flow
 * nobody names keeps the stamp it has, so a rebuild never wipes a mark and never invents one.
 *
 * What may not be replaced is read off the stamps being written, not off the store that came in, so
 * a flow named twice in one call is refused rather than quietly stamped twice.
 */
export const applyStamps = (
  store: AnchorStore,
  documents: readonly FlowDocument[],
  flowIds: readonly string[],
  snapshot: RepoSnapshot,
  options: StampOptions = {},
): AnchorStore => {
  if (flowIds.length === 0) {
    throw new StalenessError('stamping takes the flow ids of the traces that were just read');
  }
  const byId = documentsById(documents);
  const stamped = new Map<string, AnchorStamp>(Object.entries(store));
  for (const flowId of flowIds) {
    const document = byId.get(flowId);
    if (document === undefined) {
      throw new StalenessError(`no flow document is held for '${flowId}'`);
    }
    if (options.restamp !== true && stamped.has(flowId)) {
      throw new StalenessError(
        `'${flowId}' is already stamped; re-stamping takes a re-trace and is asked for by hand`,
      );
    }
    stamped.set(flowId, stampAnchors(document, snapshot));
  }
  return recordOf([...stamped]);
};

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** By the key of an entry, so a serialised record reads the same every time. */
const byKey = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
  compare(left, right);

const byFileThenCode = (left: StalenessReason, right: StalenessReason): number =>
  left.file === right.file ? compare(left.code, right.code) : compare(left.file, right.file);

/**
 * Mark one flow. Marking never re-traces: it compares the stamp against the snapshot and says
 * what it sees.
 */
export const markFlow = (
  document: FlowDocument,
  stamp: AnchorStamp | undefined,
  snapshot: RepoSnapshot,
): StalenessMark => {
  const flowId = document.id;
  if (stamp === undefined) {
    return { flowId, state: isCandidate(document) ? 'candidate' : 'unstamped', reasons: [] };
  }
  /**
   * A candidate that still holds a stamp is the far end of comparing the stamp in both directions:
   * the trace the stamp was taken of is gone, so every file it holds has been dropped. A stamp
   * survives a flow nobody names, so this is what a re-discovery or a reverted trace leaves behind,
   * and reading it as a plain candidate would put an unbadged row in the picker over a stamp that
   * no longer describes anything. It is read off the document and the stamp, both of which are
   * committed, so an unreadable repo does not change the answer.
   */
  if (isCandidate(document)) {
    const dropped = Object.keys(stamp)
      .map((file): StalenessReason => ({ code: 'dropped', file }))
      .sort(byFileThenCode);
    /**
     * A stamp naming nothing describes no trace, so there is nothing the candidate dropped and
     * nothing to report. It reads as the candidate it is, which keeps `stale` a state that always
     * names the file that made it one.
     */
    if (dropped.length === 0) return { flowId, state: 'candidate', reasons: [] };
    return { flowId, state: 'stale', reasons: dropped };
  }
  if (!snapshot.readable) return { flowId, state: 'unknown', reasons: [] };

  const anchors = anchorSetOf(document);
  const reasons: StalenessReason[] = [];

  for (const file of anchors) {
    const stamped = own(stamp, file);
    if (stamped === undefined) {
      reasons.push({ code: 'gained', file });
      continue;
    }
    const current = own(snapshot.hashes, file);
    if (current === undefined) {
      reasons.push({ code: 'gone', file });
      continue;
    }
    if (current !== stamped) reasons.push({ code: 'changed', file });
  }

  for (const file of Object.keys(stamp)) {
    if (!anchors.includes(file)) reasons.push({ code: 'dropped', file });
  }

  reasons.sort(byFileThenCode);
  return { flowId, state: reasons.length === 0 ? 'fresh' : 'stale', reasons };
};

/** Mark every flow a repo holds, in flow id order. Refuses two documents that claim one id. */
export const markFlows = (
  documents: readonly FlowDocument[],
  store: AnchorStore,
  snapshot: RepoSnapshot,
): readonly StalenessMark[] =>
  [...documentsById(documents).values()]
    .sort((left, right) => compare(left.id, right.id))
    .map((document) => markFlow(document, stampOf(store, document.id), snapshot));

/** Whether a mark says the flow was checked and holds. Only `fresh` does. */
export const readsAsFresh = (mark: StalenessMark): boolean => mark.state === 'fresh';

/**
 * Serialise the store for the committed `flow-anchors.json`, with every key in sorted order, so a
 * re-stamp of one flow does not churn the diff of another.
 */
export const serialiseAnchorStore = (store: AnchorStore): string => {
  const sorted = recordOf(
    Object.entries(store)
      .sort(byKey)
      .map(([flowId, stamp]) => [flowId, recordOf(Object.entries(stamp).sort(byKey))]),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read a committed `flow-anchors.json`. Refuses anything that is not a stamp per flow. */
export const parseAnchorStore = (text: string): AnchorStore => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new StalenessError(
      `the anchor stamps are not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!isRecord(parsed))
    throw new StalenessError('the anchor stamps must be an object per flow id');
  const store: [string, AnchorStamp][] = [];
  for (const [flowId, stamp] of Object.entries(parsed)) {
    if (!isRecord(stamp)) {
      throw new StalenessError(`the stamp of '${flowId}' must be a hash per file`);
    }
    const files: [string, FileHash][] = [];
    for (const [file, hash] of Object.entries(stamp)) {
      if (typeof hash !== 'string' || hash.trim() === '') {
        throw new StalenessError(`the stamp of '${flowId}' holds no hash for '${file}'`);
      }
      files.push([file, hash]);
    }
    store.push([flowId, recordOf(files)]);
  }
  return recordOf(store);
};
