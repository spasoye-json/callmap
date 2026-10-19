import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
const CALLS = fileURLToPath(new URL('../fixture-calls', import.meta.url));

/**
 * The extractor as the caller runs it: another process, answering over its standard output. Starting
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
  return readGraphDocument(JSON.parse(finished.stdout));
};

describe('the extractor as a separate process', { timeout: 30_000 }, () => {
  it('emits a document the core validates', () => {
    expect(documentOf(FIXTURE).language).toBe('typescript');
  });

  it('emits the calls between the functions of the repo', () => {
    expect(documentOf(CALLS, '--scope', 'src/**').calls).toContainEqual({
      caller: 'src/orders.controller.ts#OrdersController.place',
      callee: 'src/orders.service.ts#OrdersService.create',
      line: 10,
    });
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
    expect(document.calls).toContainEqual({
      caller: 'screens/checkout.tsx#Checkout',
      callee: 'shared/money.ts#formatMoney',
      line: 8,
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

  it('reports a tsconfig it cannot read rather than emitting a document with no alias in it', () => {
    const finished = run(FIXTURE, '--tsconfig', `${FIXTURE}/nowhere.json`);
    expect(finished.status).not.toBe(0);
    expect(finished.stdout).toBe('');
    expect(finished.stderr).toContain('nowhere.json');
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    const finished = run(`${FIXTURE}/nowhere`);
    expect(finished.status).not.toBe(0);
    expect(finished.stdout).toBe('');
    expect(finished.stderr).toContain('nowhere');
  });
});
