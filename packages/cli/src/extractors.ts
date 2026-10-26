import { spawn, spawnSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { assets } from './assets.ts';
import type { CachedExtractor } from './base-cache.ts';

const runExtractorProcess = (
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<string> =>
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
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim()));
    });
  });

export interface ExtractorSettings {
  readonly scope: readonly string[];
  readonly tsconfig: string | undefined;
}

const scopeArgumentsOf = (scope: readonly string[]): readonly string[] =>
  scope.flatMap((glob) => ['--scope', glob]);

const typescriptArgumentsOf = (
  repo: string,
  { scope, tsconfig }: ExtractorSettings,
): readonly string[] => [
  repo,
  ...scopeArgumentsOf(scope),
  ...(tsconfig === undefined
    ? []
    : ['--tsconfig', isAbsolute(tsconfig) ? tsconfig : join(repo, tsconfig)]),
];

export interface Extractor extends CachedExtractor {
  readonly claims: (path: string) => boolean;
  readonly readsTsconfig: boolean;
  readonly readsInParallel: boolean;
  readonly skipNote: () => string | undefined;
  readonly extract: (repo: string, settings: ExtractorSettings) => Promise<GraphDocument>;
}

const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const TYPESCRIPT_EXTRACTOR: Extractor = {
  language: 'typescript',
  lockFiles: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
  ],
  version: () => assets.typescriptExtractorVersion(),
  claims: (path) => TYPESCRIPT_FILE.test(path),
  readsTsconfig: true,
  readsInParallel: true,
  skipNote: () => undefined,
  extract: async (repo, settings) =>
    readGraphDocument(
      JSON.parse(
        await runExtractorProcess(process.execPath, [
          assets.typescriptExtractor,
          ...typescriptArgumentsOf(repo, settings),
        ]),
      ),
    ),
};

const goIsOnPath = (): boolean =>
  spawnSync('go', ['version'], { stdio: 'ignore' }).error === undefined;

export const GO_EXTRACTOR: Extractor = {
  language: 'go',
  lockFiles: ['go.sum', 'go.work.sum'],
  version: () => assets.goExtractorVersion(),
  claims: (path) => path.endsWith('.go'),
  readsTsconfig: false,
  readsInParallel: false,
  skipNote: () =>
    goIsOnPath() ? undefined : 'callmap skipped the Go files, because go is not on the PATH.',
  extract: async (repo, { scope }) =>
    readGraphDocument(
      JSON.parse(
        await runExtractorProcess(
          process.execPath,
          [assets.goExtractor, repo, ...scopeArgumentsOf(scope)],
          assets.goExtractorEnv(),
        ),
      ),
    ),
};

export const EXTRACTORS: readonly Extractor[] = [TYPESCRIPT_EXTRACTOR, GO_EXTRACTOR];
