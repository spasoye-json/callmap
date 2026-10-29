import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import { goExtractorBinary, removeGoExtractorBinary } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

afterAll(removeGoExtractorBinary);

const FILES: Readonly<Record<string, string>> = {
  'go.mod': 'module example.com/shop\n\ngo 1.22\n',
  'internal/money/money.go':
    'package money\n\nfunc Format() string { return digits() }\n\nfunc digits() string { return "" }\n',
  'internal/orders/orders.go':
    'package orders\n\nimport "example.com/shop/internal/money"\n\nfunc Total() string { return money.Format() }\n',
  'billing/invoice.go': 'package billing\n\nfunc Send() {}\n',
  'tools/gen.go': 'package tools\n\nfunc Gen() {}\n',
};

const REPO = tempDir('callmap-go-cli-');
for (const [path, text] of Object.entries(FILES)) {
  mkdirSync(dirname(join(REPO, path)), { recursive: true });
  writeFileSync(join(REPO, path), text);
}
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
  return readGraphDocument(JSON.parse(finished.stdout));
};

describe('the Go extractor as a separate process', () => {
  it('emits a document the core validates', () => {
    expect(documentOf(REPO).language).toBe('go');
  });

  it('emits the calls between the functions in scope', () => {
    expect(documentOf(REPO, '--scope', 'internal/**').calls).toEqual([
      {
        caller: 'internal/money/money.go#Format',
        callee: 'internal/money/money.go#digits',
        line: 3,
      },
      {
        caller: 'internal/orders/orders.go#Total',
        callee: 'internal/money/money.go#Format',
        line: 5,
      },
    ]);
  });

  it('writes the document and nothing else to standard output', () => {
    expect(() => {
      JSON.parse(run(REPO).stdout);
    }).not.toThrow();
  });

  it('records the scope it was given', () => {
    expect(documentOf(REPO, '--scope', 'internal/**').scope).toEqual(['internal/**']);
  });

  it('narrows the document to the scope it was given', () => {
    expect(documentOf(REPO, '--scope', 'internal/**').files).not.toContain('tools/gen.go');
  });

  it('takes every glob it is given', () => {
    const document = documentOf(REPO, '--scope', 'billing/**', '--scope', 'tools/**');
    expect(document.files).toEqual(['billing/invoice.go', 'tools/gen.go']);
  });

  it('refuses to run with no repo to read', () => {
    const finished = run();
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toMatch(/usage/i);
  });

  it('refuses a flag it does not know, rather than reading a repo it was not asked for', () => {
    const finished = run(REPO, '--depth', '2');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('--depth');
  });

  it('refuses a glob that follows no flag', () => {
    const finished = run(REPO, 'internal/**');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('internal/**');
  });

  it('refuses a scope flag with no glob after it', () => {
    const finished = run(REPO, '--scope');
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('--scope');
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    const finished = run(`${REPO}/nowhere`);
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
extractGo({ repo: ${JSON.stringify(REPO)} });`,
      ],
      { encoding: 'utf8', env: { ...process.env, TMPDIR: temp } },
    );
    expect(finished.status, finished.stderr).toBe(0);
    expect(readdirSync(temp)).toEqual([]);
  });
});
