import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  import.meta.resolve('@callmap/extractor-typescript/cli'),
);

const runExtractorProcess = (args: readonly string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TYPESCRIPT_EXTRACTOR, ...args], {
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

const sourceFilesOf = (folder: string): readonly string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort();

export const extractorVersionOf = (): string => {
  const extractor = createRequire(TYPESCRIPT_EXTRACTOR);
  const typescript = JSON.parse(
    readFileSync(extractor.resolve('typescript/package.json'), 'utf8'),
  ) as { readonly version: string };
  const hash = createHash('sha256').update(`typescript ${typescript.version}\0`);
  for (const [name, folder] of [
    ['extractor', dirname(TYPESCRIPT_EXTRACTOR)],
    ['scope', dirname(extractor.resolve('@callmap/scope'))],
  ] as const) {
    for (const file of sourceFilesOf(folder)) {
      hash
        .update(`${name}/${file}\0`)
        .update(readFileSync(join(folder, file)))
        .update('\0');
    }
  }
  return hash.digest('hex');
};
