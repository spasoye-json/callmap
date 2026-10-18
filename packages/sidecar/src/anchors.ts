/**
 * The host half of staleness (ADR-0008). `@archmap/staleness` holds every rule and never reads a
 * file, so this module hashes the files the rules ask about and writes the stamps into the map
 * file. Marking runs when the map is read, never on a git event, and it never re-traces.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlowDocument } from '@archmap/flow-document';
import {
  anchorSetOf,
  applyStamps,
  markFlows,
  repoSnapshot,
  unreadableRepo,
} from '@archmap/staleness';
import type { AnchorStore, FileHash, RepoSnapshot, StalenessMark } from '@archmap/staleness';
import { writeAnchorStore } from './map-file.ts';
import type { MapFile } from './map-file.ts';

/**
 * The hash of a file's bytes, not of its text, so a teammate on another platform reads the same
 * stamp for the same commit.
 */
const hashOf = (bytes: Buffer): FileHash => createHash('sha256').update(bytes).digest('hex');

const isAbsent = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

/**
 * Hash the named files as they stand now. A file that is not there is left out, which the rules
 * read as gone. Any other failure means the repo cannot be read, so no flow in it reads as fresh.
 */
export const snapshotOf = (repo: string, files: Iterable<string>): RepoSnapshot => {
  const hashes: [string, FileHash][] = [];
  for (const file of new Set(files)) {
    try {
      hashes.push([file, hashOf(readFileSync(join(repo, file)))]);
    } catch (error) {
      if (isAbsent(error)) continue;
      return unreadableRepo(error instanceof Error ? error.message : String(error));
    }
  }
  return repoSnapshot(Object.fromEntries(hashes));
};

/** Every file a mark of these flows compares: the anchor sets and every file a stamp holds. */
const filesToCompare = (flows: readonly FlowDocument[], store: AnchorStore): string[] => [
  ...flows.flatMap((flow) => anchorSetOf(flow)),
  ...Object.values(store).flatMap((stamp) => Object.keys(stamp)),
];

export const marksOf = (repo: string, map: MapFile): readonly StalenessMark[] =>
  markFlows(map.flows, map.anchors, snapshotOf(repo, filesToCompare(map.flows, map.anchors)));

/**
 * Stamp the flow a trace just read, and only that flow. A stamp a candidate still holds is the
 * leftover of a trace that is gone, and the trace that just ran is the one fresh claim about
 * these files, so it replaces that stamp.
 */
export const stampTracedFlow = (repo: string, map: MapFile, flow: FlowDocument): void => {
  const snapshot = snapshotOf(repo, anchorSetOf(flow));
  writeAnchorStore(repo, applyStamps(map.anchors, [flow], [flow.id], snapshot, { restamp: true }));
};
