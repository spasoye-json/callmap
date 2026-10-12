/**
 * The Go extractor as the host starts it. The extractor itself is a Go program that reads the repo
 * with the Go standard library's own parser (ADR-0009). This side only builds it, runs it as a
 * separate process, and reads what it wrote back through the core's contract, so a document the
 * core would refuse never reaches the sidecar as if it were a reference graph.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import { readReferenceGraphDocument } from '@archmap/reference-graph';

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

const PROGRAM = fileURLToPath(new URL('../go', import.meta.url));

let built: string | undefined;

/**
 * The compiled extractor, built once per host process. A fresh directory per process keeps two
 * hosts that build at the same time from writing over each other's binary. The Go build cache
 * makes every build after the first a relink.
 */
export const goExtractorBinary = (): string => {
  if (built !== undefined) return built;
  const binary = join(mkdtempSync(join(tmpdir(), 'archmap-extract-go-')), 'archmap-extract-go');
  const finished = spawnSync('go', ['build', '-o', binary, '.'], {
    cwd: PROGRAM,
    encoding: 'utf8',
  });
  if (finished.error !== undefined)
    throw new GoExtractionError(`the Go toolchain could not be started: ${finished.error.message}`);
  if (finished.status !== 0)
    throw new GoExtractionError(`the Go extractor did not build: ${finished.stderr.trim()}`);
  built = binary;
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
