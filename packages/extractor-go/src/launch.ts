/**
 * The Go extractor as Node starts it. The extractor itself is a Go program that reads the repo
 * with the Go standard library's own parser (ADR-0009). This side only builds it, runs it as a
 * separate process, and reads what it wrote back through the core's contract, so a document the
 * core would refuse never reaches a caller as if it were a reference graph.
 */

import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ReferenceGraphDocument } from '@callmap/reference-graph';
import { readReferenceGraphDocument } from '@callmap/reference-graph';

/** The tag this extractor stamps on every file it claims. */
export const GO = 'go';

/** Thrown when the Go extractor cannot be built, or refuses the repo it was pointed at. */
export class GoExtractionError extends Error {
  override readonly name = 'GoExtractionError';
}

export interface GoExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
}

const PROGRAM = join(import.meta.dirname, '../go');

let built: string | undefined;

/** Remove the compiled extractor and its directory. The next call builds it again. */
export const removeGoExtractorBinary = (): void => {
  if (built === undefined) return;
  rmSync(dirname(built), { recursive: true, force: true });
  built = undefined;
  process.off('exit', removeGoExtractorBinary);
};

const buildFailureOf = (finished: SpawnSyncReturns<string>): string | undefined => {
  if (finished.error !== undefined)
    return `the Go toolchain could not be started: ${finished.error.message}`;
  if (finished.status !== 0) return `the Go extractor did not build: ${finished.stderr.trim()}`;
  return undefined;
};

/**
 * The compiled extractor, built once per caller process. A fresh directory per process keeps two
 * callers that build at the same time from writing over each other's binary. The process removes
 * that directory when it exits, so a run leaves nothing in the temp dir. The Go build cache makes
 * every build after the first a relink.
 */
export const goExtractorBinary = (): string => {
  if (built !== undefined) return built;
  const folder = mkdtempSync(join(tmpdir(), 'callmap-extract-go-'));
  const binary = join(folder, 'callmap-extract-go');
  const failure = buildFailureOf(
    spawnSync('go', ['build', '-o', binary, '.'], { cwd: PROGRAM, encoding: 'utf8' }),
  );
  if (failure !== undefined) {
    rmSync(folder, { recursive: true, force: true });
    throw new GoExtractionError(failure);
  }
  built = binary;
  process.once('exit', removeGoExtractorBinary);
  return binary;
};

/** Read a repo with the Go extractor and return the reference graph document it emitted. */
export const extractGo = (options: GoExtractOptions): ReferenceGraphDocument => {
  const scope = options.scope ?? [];
  const args = [options.repo, ...scope.flatMap((glob) => ['--scope', glob])];
  const finished = spawnSync(goExtractorBinary(), args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (finished.status !== 0) throw new GoExtractionError(finished.stderr.trim());
  return readReferenceGraphDocument(JSON.parse(finished.stdout));
};
