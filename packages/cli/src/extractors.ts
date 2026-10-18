import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGraphDocument } from '@archmap/graph-document';
import type { GraphDocument } from '@archmap/graph-document';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  import.meta.resolve('@archmap/extractor-typescript/cli'),
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

export const extractGraph = async (repo: string): Promise<GraphDocument> =>
  readGraphDocument(JSON.parse(await runExtractorProcess([repo])));
