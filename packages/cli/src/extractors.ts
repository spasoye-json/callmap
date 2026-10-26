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

const scopeArgumentsOf = (scope: readonly string[]): readonly string[] =>
  scope.flatMap((glob) => ['--scope', glob]);

export interface Extractor extends CachedExtractor {
  readonly claims: (path: string) => boolean;
  readonly readsInParallel: boolean;
  readonly skipNote?: () => string | undefined;
  readonly extract: (repo: string, scope: readonly string[]) => Promise<GraphDocument>;
}

const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const typescriptExtractor = (tsconfig: string | undefined): Extractor => ({
  language: 'typescript',
  lockFiles: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
  ],
  options: tsconfig === undefined ? [] : [tsconfig],
  version: () => assets.typescriptExtractorVersion(),
  claims: (path) => TYPESCRIPT_FILE.test(path),
  readsInParallel: true,
  extract: async (repo, scope) =>
    readGraphDocument(
      JSON.parse(
        await runExtractorProcess(process.execPath, [
          assets.typescriptExtractor,
          repo,
          ...scopeArgumentsOf(scope),
          ...(tsconfig === undefined
            ? []
            : ['--tsconfig', isAbsolute(tsconfig) ? tsconfig : join(repo, tsconfig)]),
        ]),
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

const once = <T>(read: () => T): (() => T) => {
  let done: { readonly value: T } | undefined;
  return () => (done ??= { value: read() }).value;
};

export const goExtractor = (): Extractor => {
  const goVersion = once(goVersionOnPath);
  return {
    language: 'go',
    lockFiles: ['**/go.sum', '**/go.work.sum'],
    options: [],
    version: () => assets.goExtractorVersion(goVersion() ?? ''),
    claims: (path) => path.endsWith('.go'),
    readsInParallel: false,
    skipNote: () =>
      goVersion() === undefined
        ? 'callmap skipped the Go files, because go is not on the PATH.'
        : undefined,
    extract: async (repo, scope) =>
      readGraphDocument(
        JSON.parse(
          await runExtractorProcess(
            process.execPath,
            [assets.goExtractor, repo, ...scopeArgumentsOf(scope)],
            assets.goExtractorEnv(goVersion() ?? ''),
          ),
        ),
      ),
  };
};

export const extractorsFor = (tsconfig: string | undefined): readonly Extractor[] => [
  typescriptExtractor(tsconfig),
  goExtractor(),
];
