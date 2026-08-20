import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@archmap/reference-graph';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

/**
 * The extractor as the host runs it: another process, answering over its standard output. Starting
 * one costs a whole Node process and a whole compiler, so a run is remembered by its arguments and
 * two cases that ask the same thing pay for one.
 */
const runs = new Map<string, SpawnSyncReturns<string>>();

const run = (...args: readonly string[]) => {
  const key = JSON.stringify(args);
  const known = runs.get(key);
  if (known !== undefined) return known;
  const finished = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  runs.set(key, finished);
  return finished;
};

const documentOf = (...args: readonly string[]) => {
  const finished = run(...args);
  expect(finished.status, finished.stderr).toBe(0);
  return readReferenceGraphDocument(JSON.parse(finished.stdout));
};

describe('the extractor as a separate process', () => {
  it('emits a document the core validates', () => {
    expect(documentOf(FIXTURE).language).toBe('typescript');
  });

  it('emits a document the core indexes into a reference graph', () => {
    const graph = referenceGraphFromDocuments(documentOf(FIXTURE, '--scope', 'src/**'));
    expect(graph.references('src/screens/checkout.tsx', 'src/api/orders-client.ts')).toBe(true);
  });

  it('writes the document and nothing else to standard output', () => {
    expect(() => {
      JSON.parse(run(FIXTURE).stdout);
    }).not.toThrow();
  });

  it('records the scope it was given', () => {
    expect(documentOf(FIXTURE, '--scope', 'src/**').scope).toEqual(['src/**']);
  });

  it('narrows the document to the scope it was given', () => {
    expect(documentOf(FIXTURE, '--scope', 'src/**').files).not.toContain('tools/build.ts');
  });

  it('takes every glob it is given', () => {
    const document = documentOf(FIXTURE, '--scope', 'src/legacy/**', '--scope', 'tools/**');
    expect(document.files).toEqual([
      'src/legacy/round.js',
      'src/legacy/totals.js',
      'tools/build.ts',
    ]);
  });

  it('resolves aliases through the tsconfig it is pointed at', () => {
    const document = documentOf(`${FIXTURE}/src`, '--tsconfig', `${FIXTURE}/tsconfig.json`);
    expect(document.edges).toContainEqual({
      from: 'screens/checkout.tsx',
      to: 'api/orders-client.ts',
    });
  });

  it('refuses to run with no repo to read', () => {
    const finished = run();
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toMatch(/usage/i);
  });

  it('refuses a flag it does not know, rather than reading a repo it was not asked for', () => {
    const finished = run(FIXTURE, '--depth', '2');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('--depth');
  });

  it('refuses a glob that follows no flag', () => {
    const finished = run(FIXTURE, 'src/**');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('src/**');
  });

  it('refuses a scope flag with no glob after it', () => {
    const finished = run(FIXTURE, '--scope');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('--scope');
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    const finished = run(`${FIXTURE}/nowhere`);
    expect(finished.status).not.toBe(0);
    expect(finished.stdout).toBe('');
    expect(finished.stderr).toContain('nowhere');
  });
});
