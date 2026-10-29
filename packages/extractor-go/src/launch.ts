/**
 * The Go extractor as Node starts it. The extractor itself is a Go program that loads the repo
 * with golang.org/x/tools/go/packages and ties each call with go/types (ADR-0024). This side only
 * builds it, runs it as a separate process, and reads what it wrote back through the core's
 * contract, so a document the core would refuse never reaches a caller.
 */

import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';

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

/**
 * A host that carries the program elsewhere, such as the npm package with the program in its dist
 * folder, names it in CALLMAP_GO_EXTRACTOR_SOURCE.
 */
const PROGRAM = process.env['CALLMAP_GO_EXTRACTOR_SOURCE'] ?? join(import.meta.dirname, '../go');

let built: string | undefined;
let temporary = false;

/** Remove the compiled extractor and its directory. The next call builds it again. */
export const removeGoExtractorBinary = (): void => {
  if (built === undefined) return;
  if (temporary) rmSync(dirname(built), { recursive: true, force: true });
  built = undefined;
  temporary = false;
  process.off('exit', removeGoExtractorBinary);
};

const isTrimpath = (flag: string): boolean => {
  const name = flag.replace(/^-/, '').split('=')[0];
  return name === '-trimpath' || name === 'trimpath';
};

/** The same filter as `keptGoFlags` in go/load.go, so the build and the load agree. */
const keptGoFlags = (flags: string): string =>
  flags
    .split(/\s+/)
    .filter(
      (flag) =>
        flag !== '' && !flag.startsWith('-mod=') && !flag.startsWith('--mod=') && !isTrimpath(flag),
    )
    .join(' ');

/** A GOFLAGS from `go env -w` is in the go env file, not in the environment. */
const effectiveGoFlags = (): string => {
  const finished = spawnSync('go', ['env', 'GOFLAGS'], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local' },
  });
  return finished.error === undefined ? finished.stdout.trim() : '';
};

/**
 * The build reads only the vendored modules of the extractor, with the local go, so it needs no
 * network. GOWORK is off because the package can sit inside a repo with its own go.work. GOFLAGS
 * is never empty, because the go tool reads an empty GOFLAGS from the go env file instead.
 */
const buildEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GOFLAGS: ` ${keptGoFlags(effectiveGoFlags())}`,
  GOTOOLCHAIN: 'local',
  GOPROXY: 'off',
  GOWORK: 'off',
});

const buildFailureOf = (finished: SpawnSyncReturns<string>): string | undefined => {
  if (finished.error !== undefined)
    return `the Go toolchain could not be started: ${finished.error.message}`;
  if (finished.status !== 0) return `the Go extractor did not build: ${finished.stderr.trim()}`;
  return undefined;
};

const buildGoExtractor = (binary: string): void => {
  const failure = buildFailureOf(
    spawnSync('go', ['build', '-o', binary, '.'], {
      cwd: PROGRAM,
      encoding: 'utf8',
      env: buildEnv(),
    }),
  );
  if (failure !== undefined) throw new GoExtractionError(failure);
};

/**
 * A fresh directory per process keeps two callers that build at the same time from writing over
 * each other's binary. The process removes that directory when it exits, so a run leaves nothing
 * in the temp dir. The Go build cache makes every build after the first a relink.
 */
const binaryForThisProcess = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'callmap-extract-go-'));
  const binary = join(folder, 'callmap-extract-go');
  try {
    buildGoExtractor(binary);
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  process.once('exit', removeGoExtractorBinary);
  temporary = true;
  return binary;
};

/**
 * A binary that outlives the process, at the path that a host names in
 * CALLMAP_GO_EXTRACTOR_BINARY. The host puts its version in that path, so a binary there is never
 * stale. The build writes to a name of its own and renames it, so a caller never runs half a file.
 */
const keptBinaryAt = (binary: string): string => {
  if (existsSync(binary)) return binary;
  mkdirSync(dirname(binary), { recursive: true });
  const partial = `${binary}.${process.pid}.partial`;
  try {
    buildGoExtractor(partial);
    renameSync(partial, binary);
  } finally {
    rmSync(partial, { force: true });
  }
  return binary;
};

export const goExtractorBinary = (): string => {
  if (built !== undefined) return built;
  const kept = process.env['CALLMAP_GO_EXTRACTOR_BINARY'];
  built = kept === undefined ? binaryForThisProcess() : keptBinaryAt(kept);
  return built;
};

/**
 * Read a repo with the Go extractor and return the graph document it emitted. The scope is read as
 * it is given, so a caller that wants the tests left out puts the test globs in it.
 */
export const extractGo = (options: GoExtractOptions): GraphDocument => {
  const scope = options.scope ?? [];
  const args = [options.repo, ...scope.flatMap((glob) => ['--scope', glob]), '--tests'];
  const finished = spawnSync(goExtractorBinary(), args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (finished.status !== 0) throw new GoExtractionError(finished.stderr.trim());
  return readGraphDocument(JSON.parse(finished.stdout));
};
