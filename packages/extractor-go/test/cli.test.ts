import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@callmap/reference-graph';
import { goExtractorBinary, removeGoExtractorBinary } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

afterAll(removeGoExtractorBinary);

const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
const LAUNCH = new URL('../src/launch.ts', import.meta.url).href;

/**
 * The extractor as the caller runs it: a compiled Go program, answering over its standard output. A
 * run is remembered by its arguments, so two cases that ask the same thing pay for one.
 */
const runs = new Map<string, SpawnSyncReturns<string>>();

const run = (...args: readonly string[]) => {
  const key = JSON.stringify(args);
  const known = runs.get(key);
  if (known !== undefined) return known;
  const finished = spawnSync(goExtractorBinary(), args, { encoding: 'utf8' });
  runs.set(key, finished);
  return finished;
};

const documentOf = (...args: readonly string[]) => {
  const finished = run(...args);
  expect(finished.status, finished.stderr).toBe(0);
  return readReferenceGraphDocument(JSON.parse(finished.stdout));
};

describe('the Go extractor as a separate process', () => {
  it('emits a document the core validates', () => {
    expect(documentOf(FIXTURE).language).toBe('go');
  });

  it('emits a document the core indexes into a reference graph', () => {
    const graph = referenceGraphFromDocuments(documentOf(FIXTURE, '--scope', 'internal/**'));
    expect(graph.references('internal/orders/orders.go', 'internal/money/money.go')).toBe(true);
  });

  it('writes the document and nothing else to standard output', () => {
    expect(() => {
      JSON.parse(run(FIXTURE).stdout);
    }).not.toThrow();
  });

  it('records the scope it was given', () => {
    expect(documentOf(FIXTURE, '--scope', 'internal/**').scope).toEqual(['internal/**']);
  });

  it('narrows the document to the scope it was given', () => {
    expect(documentOf(FIXTURE, '--scope', 'internal/**').files).not.toContain('tools/gen/gen.go');
  });

  it('takes every glob it is given', () => {
    const document = documentOf(FIXTURE, '--scope', 'billing/**', '--scope', 'tools/**');
    expect(document.files).toEqual(['billing/invoice/invoice.go', 'tools/gen/gen.go']);
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
    const finished = run(FIXTURE, 'internal/**');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('internal/**');
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

describe('the build of the Go extractor', () => {
  it('leaves nothing in the temp dir after the process that built it ends', () => {
    const temp = tempDir('callmap-go-build-');
    const finished = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { extractGo } from ${JSON.stringify(LAUNCH)};
extractGo({ repo: ${JSON.stringify(FIXTURE)} });`,
      ],
      { encoding: 'utf8', env: { ...process.env, TMPDIR: temp } },
    );
    expect(finished.status, finished.stderr).toBe(0);
    expect(readdirSync(temp)).toEqual([]);
  });
});
