import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@archmap/reference-graph';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

/**
 * The extractor as the caller runs it: another process, answering over its standard output. A run
 * costs a Node process and a Ruby process, so it is remembered by its arguments.
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

describe('the Ruby extractor as a separate process', () => {
  it('emits a document the core validates', () => {
    expect(documentOf(FIXTURE).language).toBe('ruby');
  });

  it('emits a document the core indexes into a reference graph', () => {
    const graph = referenceGraphFromDocuments(documentOf(FIXTURE, '--scope', 'shop/**'));
    expect(
      graph.references('shop/app/jobs/receipt_job.rb', 'shop/app/services/shipping/label.rb'),
    ).toBe(true);
  });

  it('writes the document and nothing else to standard output', () => {
    expect(() => {
      JSON.parse(run(FIXTURE).stdout);
    }).not.toThrow();
  });

  it('takes every glob it is given and records them', () => {
    const document = documentOf(FIXTURE, '--scope', 'shop/lib/**', '--scope', 'tools/**');
    expect(document.scope).toEqual(['shop/lib/**', 'tools/**']);
    expect(document.files).toEqual(['shop/lib/reconcile.rb', 'tools/release.rb']);
  });

  it('refuses to run with no repo to read', () => {
    const finished = run();
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toMatch(/usage/i);
  });

  it('refuses a flag it does not know, rather than reading a repo it was not asked for', () => {
    const finished = run(FIXTURE, '--tsconfig', 'tsconfig.json');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('--tsconfig');
  });

  it('refuses a glob that follows no flag', () => {
    const finished = run(FIXTURE, 'shop/**');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('shop/**');
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
