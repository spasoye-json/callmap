import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const TYPESCRIPT_FIXTURE = fileURLToPath(
  new URL('../../extractor-typescript/fixture', import.meta.url),
);

/**
 * The sidecar as the shell runs it: a process that reads one request per line on standard input
 * and writes one response per line on standard output, in the order the requests came.
 */
const converse = async (lines: readonly string[]): Promise<readonly unknown[]> => {
  const child = spawn(process.execPath, [MAIN], { stdio: ['pipe', 'pipe', 'inherit'] });
  const responses: unknown[] = [];
  const reader = createInterface({ input: child.stdout });
  const finished = new Promise<void>((resolve, reject) => {
    reader.on('line', (line) => {
      responses.push(JSON.parse(line));
      if (responses.length === lines.length) resolve();
    });
    child.on('close', (status) => {
      reject(new Error(`the sidecar exited with ${String(status)} before it answered`));
    });
  });
  for (const line of lines) child.stdin.write(`${line}\n`);
  await finished;
  child.stdin.end();
  return responses;
};

describe('the sidecar as a separate process', () => {
  it('answers open and extract, one line each, in order', async () => {
    const [opened, extracted] = await converse([
      JSON.stringify({ command: 'open', repo: TYPESCRIPT_FIXTURE, scope: ['src/**'] }),
      JSON.stringify({
        command: 'extract',
        repo: TYPESCRIPT_FIXTURE,
        scope: ['src/**'],
        languages: ['typescript'],
      }),
    ]);
    expect(opened).toMatchObject({ ok: true, result: { languages: ['typescript'] } });
    expect(extracted).toMatchObject({ ok: true, result: { summary: { files: 8, edges: 9 } } });
  });

  it('refuses a line that is not JSON and keeps answering', async () => {
    const [refused, opened] = await converse([
      '{ not json',
      JSON.stringify({ command: 'open', repo: TYPESCRIPT_FIXTURE, scope: [] }),
    ]);
    expect(refused).toMatchObject({ ok: false, error: { code: 'malformed-request' } });
    expect(opened).toMatchObject({ ok: true });
  });
});
