import { spawn, spawnSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { assets } from './assets.ts';
import type { CachedExtractor } from './base-cache.ts';

interface FinishedExtractorProcess {
  readonly stdout: string;
  readonly stderr: string;
}

const runExtractorProcess = (
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<FinishedExtractorProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0)
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim()));
    });
  });

const scopeArgumentsOf = (scope: readonly string[]): readonly string[] =>
  scope.flatMap((glob) => ['--scope', glob]);

export interface Extractor extends CachedExtractor {
  readonly claimsAnyOf: (inScope: readonly string[], files: readonly string[]) => boolean;
  readonly readsInParallel: boolean;
  readonly skipNote?: () => string | undefined;
  readonly notes?: () => readonly string[];
  readonly extract: (repo: string, scope: readonly string[]) => Promise<GraphDocument>;
}

const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const typescriptExtractor = (tsconfig: string | undefined): Extractor => ({
  language: 'typescript',
  dependencyFiles: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
  ],
  options: tsconfig === undefined ? [] : [tsconfig],
  version: () => assets.typescriptExtractorVersion(),
  claimsAnyOf: (inScope) => inScope.some((path) => TYPESCRIPT_FILE.test(path)),
  readsInParallel: true,
  extract: async (repo, scope) =>
    readGraphDocument(
      JSON.parse(
        (
          await runExtractorProcess(process.execPath, [
            assets.typescriptExtractor,
            repo,
            ...scopeArgumentsOf(scope),
            ...(tsconfig === undefined
              ? []
              : ['--tsconfig', isAbsolute(tsconfig) ? tsconfig : join(repo, tsconfig)]),
          ])
        ).stdout,
      ),
    ),
});

const goVersionOnPath = (): string | undefined => {
  const finished = spawnSync('go', ['version'], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local', GOPROXY: 'off' },
  });
  return finished.error === undefined && finished.status === 0 ? finished.stdout : undefined;
};

/** The go line of the go.mod of the Go extractor. An older go cannot build it. */
const GO_THAT_BUILDS_THE_EXTRACTOR = [1, 26] as const;

const goOlderThanTheExtractorNeeds = (goVersion: string): string | undefined => {
  const found = /go(\d+)\.(\d+)\S*/.exec(goVersion);
  if (found === null) return undefined;
  const [major, minor] = GO_THAT_BUILDS_THE_EXTRACTOR;
  const older =
    Number(found[1]) < major || (Number(found[1]) === major && Number(found[2]) < minor);
  return older ? found[0] : undefined;
};

const goSkipNoteOf = (goVersion: string | undefined): string | undefined => {
  if (goVersion === undefined)
    return 'callmap skipped the Go files, because go is not on the PATH.';
  const older = goOlderThanTheExtractorNeeds(goVersion);
  if (older === undefined) return undefined;
  const [major, minor] = GO_THAT_BUILDS_THE_EXTRACTOR;
  return `callmap skipped the Go files, because the Go extractor needs go ${major}.${minor} or later, and the go on the PATH is ${older}.`;
};

const isTrimpath = (flag: string): boolean => {
  const name = flag.replace(/^-/, '').split('=')[0];
  return name === '-trimpath' || name === 'trimpath';
};

/** The flags that `keptGoFlags` in packages/extractor-go/go/load.go keeps, so the two agree. */
const keptGoFlags = (flags: string): string =>
  flags
    .split(/\s+/)
    .filter(
      (flag) =>
        flag !== '' && !flag.startsWith('-mod=') && !flag.startsWith('--mod=') && !isTrimpath(flag),
    )
    .join(' ');

const GO_BUILD_SETTINGS = ['CGO_ENABLED', 'GOOS', 'GOARCH', 'GOEXPERIMENT', 'GOFLAGS'] as const;

/** The go env settings that choose the files of one build, as the load of the repo sees them. */
const goBuildSettings = (): readonly string[] => {
  const finished = spawnSync('go', ['env', ...GO_BUILD_SETTINGS], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local' },
  });
  const values = finished.error === undefined ? finished.stdout.split('\n') : [];
  return GO_BUILD_SETTINGS.map((setting, index) => {
    const value = values[index] ?? '';
    return `${setting}=${setting === 'GOFLAGS' ? keptGoFlags(value) : value}`;
  });
};

/** The lines that packages/extractor-go/go/load.go writes to stderr about a module it skipped. */
const goNotesIn = (stderr: string): readonly string[] =>
  stderr.split('\n').filter((line) => line.startsWith('callmap '));

const directoryOf = (path: string): string => path.split('/').slice(0, -1).join('/');

const isGoMod = (path: string): boolean => path === 'go.mod' || path.endsWith('/go.mod');

/** The directories that `skipped` in packages/extractor-go/go/walk.go names, so the two agree. */
const goSkipsDirectory = (name: string): boolean =>
  name === 'vendor' ||
  name === 'testdata' ||
  name === 'node_modules' ||
  name.startsWith('.') ||
  name.startsWith('_');

const goWalkReads = (path: string, moduleDirs: ReadonlySet<string>): boolean => {
  if (!path.endsWith('.go')) return false;
  const dirs = path.split('/').slice(0, -1);
  if (dirs.some(goSkipsDirectory)) return false;
  return (
    dirs.some((_, index) => moduleDirs.has(dirs.slice(0, index + 1).join('/'))) ||
    moduleDirs.has('')
  );
};

const once = <T>(read: () => T): (() => T) => {
  let done: { readonly value: T } | undefined;
  return () => (done ??= { value: read() }).value;
};

export const goExtractor = (): Extractor => {
  const goVersion = once(goVersionOnPath);
  const buildSettings = once(goBuildSettings);
  const notes = new Set<string>();
  return {
    language: 'go',
    dependencyFiles: ['go.work', '**/go.sum', '**/go.work.sum'],
    get options() {
      return buildSettings();
    },
    version: () => assets.goExtractorVersion(goVersion() ?? ''),
    claimsAnyOf: (inScope, files) => {
      const moduleDirs = new Set(files.filter(isGoMod).map(directoryOf));
      return inScope.some((path) => goWalkReads(path, moduleDirs));
    },
    readsInParallel: false,
    skipNote: () => goSkipNoteOf(goVersion()),
    notes: () => [...notes],
    extract: async (repo, scope) => {
      const { stdout, stderr } = await runExtractorProcess(
        process.execPath,
        [assets.goExtractor, repo, ...scopeArgumentsOf(scope)],
        assets.goExtractorEnv(goVersion() ?? ''),
      );
      for (const note of goNotesIn(stderr)) notes.add(note);
      return readGraphDocument(JSON.parse(stdout));
    },
  };
};

export const extractorsFor = (tsconfig: string | undefined): readonly Extractor[] => [
  typescriptExtractor(tsconfig),
  goExtractor(),
];
