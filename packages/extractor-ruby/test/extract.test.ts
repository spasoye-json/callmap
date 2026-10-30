import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { extractRuby } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const ORDER = 'shop/app/models/order.rb';
const REPORT = 'shop/app/models/report.rb';
const LABEL = 'shop/app/services/shipping/label.rb';
const RECEIPT_JOB = 'shop/app/jobs/receipt_job.rb';
const RELEASE = 'tools/release.rb';

const runs = new Map<string, GraphDocument>();

const extract = (...scope: readonly string[]): GraphDocument => {
  const key = JSON.stringify(scope);
  const known = runs.get(key);
  if (known !== undefined) return known;
  const document = extractRuby({ repo: FIXTURE, scope });
  runs.set(key, document);
  return document;
};

const repoOf = (files: Readonly<Record<string, string>>): string => {
  const repo = tempDir('callmap-ruby-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

const namesIn = (document: GraphDocument, file: string): readonly string[] =>
  document.functions.filter((graphFunction) => graphFunction.file === file).map(({ name }) => name);

const callsOf = (document: GraphDocument): readonly string[] =>
  document.calls.map(({ caller, callee, line }) => `${caller} ${callee} ${line}`);

const openEndsOf = (document: GraphDocument): readonly string[] =>
  document.openEnds.map(
    ({ caller, line, expression, reason }) => `${caller} ${line} ${expression} ${reason}`,
  );

describe('extractRuby', () => {
  it('emits a graph document that the core accepts, in the Ruby language', () => {
    const document = readGraphDocument(extract());
    expect(document.language).toBe('ruby');
  });

  it('names an instance method with # and a singleton method with a dot', () => {
    expect(namesIn(extract(), ORDER)).toEqual([
      'Order.find_open',
      'Order.recent',
      'Order#total',
      'Order#subtotal',
      'Order#discount_of',
      'Order#count',
    ]);
  });

  it('names a method of a nested class with its full name', () => {
    expect(namesIn(extract(), LABEL)).toEqual([
      'Shipping::Label#initialize',
      'Shipping::Label#print',
    ]);
  });

  it('gives each function the file and the name as its id, and its first and last line', () => {
    expect(extract().functions.find(({ name }) => name === 'Order.recent')).toMatchObject({
      id: `${ORDER}#Order.recent`,
      file: ORDER,
      firstLine: 11,
      lastLine: 13,
    });
  });

  it('adds the ~n suffix in source order to a repeated name of one file', () => {
    const repo = repoOf({
      'lib/cart.rb': 'class Cart\n  def add; end\nend\n\nclass Cart\n  def add; end\nend\n',
    });
    expect(extractRuby({ repo }).functions.map(({ id }) => id)).toEqual([
      'lib/cart.rb#Cart#add',
      'lib/cart.rb#Cart#add~2',
    ]);
  });

  it('names a method at the top level of a file by its name alone', () => {
    const repo = repoOf({ 'bin/setup.rb': 'def run\n  prepare\nend\n\ndef prepare; end\n' });
    const document = extractRuby({ repo });
    expect(document.functions.map(({ name }) => name)).toEqual(['run', 'prepare']);
    expect(callsOf(document)).toEqual(['bin/setup.rb#run bin/setup.rb#prepare 2']);
  });

  it('changes the source hash of a method when its text changes, and of no other method', () => {
    const before = repoOf({
      'lib/cart.rb': 'class Cart\n  def add\n    1\n  end\n\n  def drop; end\nend\n',
    });
    const after = repoOf({
      'lib/cart.rb': 'class Cart\n  def add\n    2\n  end\n\n  def drop; end\nend\n',
    });
    const hashes = (repo: string) =>
      extractRuby({ repo }).functions.map(({ sourceHash }) => sourceHash);
    const [addBefore, dropBefore] = hashes(before);
    const [addAfter, dropAfter] = hashes(after);
    expect(addAfter).not.toBe(addBefore);
    expect(dropAfter).toBe(dropBefore);
  });
});

describe('the calls of extractRuby', () => {
  it('ties a call with no receiver and a call on self to a def of the same class', () => {
    expect(callsOf(extract())).toEqual(
      expect.arrayContaining([
        `${ORDER}#Order#total ${ORDER}#Order#subtotal 18`,
        `${ORDER}#Order#total ${ORDER}#Order#discount_of 18`,
        `${ORDER}#Order.recent ${ORDER}#Order.find_open 12`,
      ]),
    );
  });

  it('gives a call in a block to the def around it', () => {
    expect(callsOf(extract())).toContain(`${ORDER}#Order#total ${ORDER}#Order#count 17`);
  });

  it('ties a call on a constant to a singleton method of that class', () => {
    expect(callsOf(extract())).toContain(`${REPORT}#Report#rows ${ORDER}#Order.recent 3`);
  });

  it('ties Foo.new to Foo#initialize', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform ${LABEL}#Shipping::Label#initialize 4`,
    );
  });

  it('gives an untyped open end for a call that does not tie, when a def of the repo has its name', () => {
    expect(openEndsOf(extract())).toEqual(
      expect.arrayContaining([
        `${RECEIPT_JOB}#ReceiptJob#perform 4 Shipping::Label.new(order).print untyped`,
        `${ORDER}#Order#discount_of 26 discount untyped`,
      ]),
    );
  });

  it('draws nothing for a library call, whose name no def of the repo has', () => {
    const document = extract();
    const lines = [...document.calls, ...document.openEnds]
      .filter(({ caller }) => caller === `${ORDER}#Order#subtotal`)
      .map(({ line }) => line);
    expect(lines).toEqual([]);
  });

  it('draws nothing for a call outside any def', () => {
    const document = extract();
    const fromRelease = [...document.calls, ...document.openEnds].filter(({ caller }) =>
      caller.startsWith(RELEASE),
    );
    expect(fromRelease.map(({ line }) => line)).toEqual([3]);
  });

  it('gives a library call for a callee whose file the scope leaves out', () => {
    const document = extract('shop/app/models/report.rb');
    expect(document.calls).toEqual([]);
    expect(document.openEnds).toEqual([]);
  });
});

describe('the checker and the files of extractRuby', () => {
  it('names Callmap Ruby rules with the extractor version and the version of the ruby that ran', () => {
    const { checker } = extract();
    expect(checker.name).toBe('Callmap Ruby rules');
    expect(checker.version).toMatch(/^\d+, ruby \d+\.\d+\.\d+/);
  });

  it('records the scope the document was built under, and claims every Ruby file in it', () => {
    const document = extract('shop/config/**', 'shop/lib/**', 'tools/**');
    expect(document.scope).toEqual(['shop/config/**', 'shop/lib/**', 'tools/**']);
    expect(document.files).toEqual([
      'shop/config/application.rb',
      'shop/lib/reconcile.rb',
      RELEASE,
    ]);
  });

  it('claims a file that Ripper cannot parse with no functions, and keeps reading the others', () => {
    const repo = repoOf({
      'app/models/broken.rb': 'class Broken\n  def oops(\nend\n',
      'app/models/cart.rb': 'class Cart\n  def add; end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(document.files).toEqual(['app/models/broken.rb', 'app/models/cart.rb']);
    expect(document.functions.map(({ id }) => id)).toEqual(['app/models/cart.rb#Cart#add']);
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    expect(() => extractRuby({ repo: join(FIXTURE, 'nowhere') })).toThrow(/nowhere/);
  });
});
