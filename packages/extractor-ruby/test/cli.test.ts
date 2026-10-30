import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import { effectiveScope } from '@callmap/scope';
import { tempDir } from '../../../test/temp-dir.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const WITH_TESTS = tempDir('callmap-ruby-cli-tests-');
for (const path of [
  'lib/order.rb',
  'lib/order_spec.rb',
  'lib/order_test.rb',
  'spec/support/factories.rb',
  'test/test_helper.rb',
]) {
  mkdirSync(dirname(join(WITH_TESTS, path)), { recursive: true });
  writeFileSync(join(WITH_TESTS, path), 'class Order\nend\n');
}

const BROKEN = tempDir('callmap-ruby-cli-broken-');
mkdirSync(join(BROKEN, 'app/models'), { recursive: true });
writeFileSync(join(BROKEN, 'app/models/broken.rb'), 'class Broken\n  def oops(\nend\n');
writeFileSync(join(BROKEN, 'app/models/cart.rb'), 'class Cart\n  def add; end\nend\n');

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
  return readGraphDocument(JSON.parse(finished.stdout));
};

describe('the Ruby extractor as a separate process', () => {
  it('emits a document the core validates', () => {
    expect(documentOf(FIXTURE).language).toBe('ruby');
  });

  it('emits the functions and the calls of the repo', () => {
    const document = documentOf(FIXTURE, '--scope', 'shop/**');
    expect(document.calls).toContainEqual({
      caller: 'shop/app/models/report.rb#Report#rows',
      callee: 'shop/app/models/order.rb#Order.recent',
      line: 3,
    });
  });

  it('prints one line for each file that Ripper cannot parse, and still emits the document', () => {
    const finished = run(BROKEN);
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stderr).toBe(
      'callmap read no functions in app/models/broken.rb, because Ripper could not parse it.\n',
    );
    expect(readGraphDocument(JSON.parse(finished.stdout)).files).toEqual([
      'app/models/broken.rb',
      'app/models/cart.rb',
    ]);
  });

  it('writes the document and nothing else to standard output', () => {
    expect(() => {
      JSON.parse(run(FIXTURE).stdout);
    }).not.toThrow();
  });

  it('takes every glob it is given and records them', () => {
    const document = documentOf(FIXTURE, '--scope', 'shop/lib/**', '--scope', 'tools/**');
    expect(document.scope).toEqual(effectiveScope(['shop/lib/**', 'tools/**'], false));
    expect(document.files).toEqual(['shop/lib/reconcile.rb', 'tools/release.rb']);
  });

  it('reads no test file by default, also under a glob of the user', () => {
    expect(documentOf(WITH_TESTS).files).toEqual(['lib/order.rb']);
    expect(documentOf(WITH_TESTS, '--scope', 'lib/**').files).toEqual(['lib/order.rb']);
  });

  it('reads the test files when it is asked for the tests', () => {
    const document = documentOf(WITH_TESTS, '--tests');
    expect(document.scope).toEqual([]);
    expect(document.files).toEqual([
      'lib/order.rb',
      'lib/order_spec.rb',
      'lib/order_test.rb',
      'spec/support/factories.rb',
      'test/test_helper.rb',
    ]);
  });

  it('refuses to run with no repo to read', () => {
    const finished = run();
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toMatch(/usage/i);
    expect(finished.stderr).toContain('[--tests]');
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
