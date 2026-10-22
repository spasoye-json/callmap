import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { assets } from './assets.ts';

const runExtractorProcess = (args: readonly string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [assets.typescriptExtractor, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
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

const argumentsOf = (repo: string, { scope, tsconfig }: ExtractorSettings): readonly string[] => [
  repo,
  ...scope.flatMap((glob) => ['--scope', glob]),
  ...(tsconfig === undefined
    ? []
    : ['--tsconfig', isAbsolute(tsconfig) ? tsconfig : join(repo, tsconfig)]),
];

export const extractGraphDocumentOf = async (
  repo: string,
  settings: ExtractorSettings,
): Promise<GraphDocument> =>
  readGraphDocument(JSON.parse(await runExtractorProcess(argumentsOf(repo, settings))));

export const extractorVersionOf = (): string => assets.extractorVersion();
