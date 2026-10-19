import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@callmap/reference-graph';
import type { ReferenceGraphDocument } from '@callmap/reference-graph';
import { ExtractionError, extractRuby } from '../src/index.ts';

/** The tiny two-app Rails repo this package commits, read the way an extractor reads a repo. */
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const ORDER = 'shop/app/models/order.rb';
const LINE_ITEM = 'shop/app/models/line_item.rb';
const APPLICATION_RECORD = 'shop/app/models/application_record.rb';
const REPORT = 'shop/app/models/report.rb';
const ADMIN_REPORT = 'shop/app/models/admin/report.rb';
const DISCOUNTABLE = 'shop/app/models/concerns/discountable.rb';
const BASE_CONTROLLER = 'shop/app/controllers/admin/base_controller.rb';
const ORDERS_CONTROLLER = 'shop/app/controllers/admin/orders_controller.rb';
const REFUNDS_CONTROLLER = 'shop/app/controllers/admin/refunds_controller.rb';
const RECEIPT_JOB = 'shop/app/jobs/receipt_job.rb';
const LABEL = 'shop/app/services/shipping/label.rb';
const SHOP_APPLICATION = 'shop/config/application.rb';
const RECONCILE = 'shop/lib/reconcile.rb';
const INVOICES_CONTROLLER = 'billing/app/controllers/invoices_controller.rb';
const INVOICE = 'billing/app/models/invoice.rb';
const BILLING_ORDER = 'billing/app/models/order.rb';
const RELEASE = 'tools/release.rb';

/**
 * Every run starts a Ruby process, so a run is remembered by its scope and two cases that ask the
 * same thing pay for one.
 */
const runs = new Map<string, ReferenceGraphDocument>();

const extract = (...scope: readonly string[]): ReferenceGraphDocument => {
  const key = JSON.stringify(scope);
  const known = runs.get(key);
  if (known !== undefined) return known;
  const document = extractRuby({ repo: FIXTURE, scope });
  runs.set(key, document);
  return document;
};

const targetsOf = (from: string, ...scope: readonly string[]): readonly string[] =>
  extract(...scope)
    .edges.filter((edge) => edge.from === from)
    .map((edge) => edge.to);

const appOf = (path: string): string => path.split('/')[0] ?? '';

/** A throwaway repo holding exactly the given files. */
const repoOf = (files: Readonly<Record<string, string>>): string => {
  const repo = mkdtempSync(join(tmpdir(), 'callmap-ruby-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

describe('extractRuby', () => {
  it('emits a document the core validates', () => {
    const document = readReferenceGraphDocument(extract());
    expect(document.language).toBe('ruby');
    expect(() => referenceGraphFromDocuments(document)).not.toThrow();
  });

  it('records the scope the document was built under', () => {
    expect(extract('shop/**').scope).toEqual(['shop/**']);
  });

  it('claims every Ruby file in scope, inside the autoload roots or not', () => {
    expect(extract('shop/config/**', 'shop/lib/**', 'tools/**').files).toEqual([
      SHOP_APPLICATION,
      RECONCILE,
      RELEASE,
    ]);
  });

  it('resolves a constant reference to the file Zeitwerk names for it', () => {
    expect(extract().edges).toContainEqual({ from: ORDER, to: LINE_ITEM });
  });

  it('reads a superclass as a reference', () => {
    expect(targetsOf(LINE_ITEM)).toEqual([APPLICATION_RECORD]);
  });

  it('names a file in a subdirectory of a root under the namespace of that directory', () => {
    expect(targetsOf(RECEIPT_JOB)).toContain(LABEL);
  });

  it('resolves a name through the namespaces it was written inside', () => {
    expect(targetsOf(ORDERS_CONTROLLER)).toContain(BASE_CONTROLLER);
    expect(targetsOf(ORDERS_CONTROLLER)).toContain(ADMIN_REPORT);
  });

  it('does not search a namespace a compact class name only passes through, as Ruby does not', () => {
    expect(targetsOf(REFUNDS_CONTROLLER)).toContain(REPORT);
    expect(targetsOf(REFUNDS_CONTROLLER)).not.toContain(ADMIN_REPORT);
  });

  it('resolves an absolute reference at the top level only', () => {
    expect(targetsOf(RECEIPT_JOB)).toContain(ORDER);
  });

  it('treats a concern directory as an autoload root of its own', () => {
    expect(targetsOf(ORDER)).toContain(DISCOUNTABLE);
  });

  it('resolves a name inside its own app when another app defines the same name', () => {
    expect(targetsOf(INVOICES_CONTROLLER)).toEqual([INVOICE, BILLING_ORDER]);
  });

  it('emits no edge for a name only another app defines, because that is a boundary', () => {
    expect(targetsOf(ORDERS_CONTROLLER)).not.toContain(INVOICE);
    expect(extract().edges.filter((edge) => appOf(edge.from) !== appOf(edge.to))).toEqual([]);
  });

  it('emits no edge for a name no file of the app defines, such as a gem constant', () => {
    expect(targetsOf(ORDERS_CONTROLLER)).toEqual([BASE_CONTROLLER, ADMIN_REPORT, ORDER]);
  });

  it('invents no edge for code outside the autoload roots, in either direction', () => {
    const outside = [SHOP_APPLICATION, RECONCILE, RELEASE];
    const touching = extract().edges.filter(
      (edge) => outside.includes(edge.from) || outside.includes(edge.to),
    );
    expect(touching).toEqual([]);
  });

  it('drops a reference whose file the scope leaves out, rather than naming one Ruby would skip', () => {
    const scope = ['shop/app/controllers/**', REPORT];
    expect(targetsOf(ORDERS_CONTROLLER, ...scope)).toEqual([BASE_CONTROLLER]);
  });

  it('emits no edge from a file to itself', () => {
    const repo = repoOf({
      'config/application.rb': 'module App; class Application; end; end\n',
      'app/models/node.rb': 'class Node\n  def parent = Node.new\nend\n',
    });
    expect(extractRuby({ repo }).edges).toEqual([]);
  });

  it('reads a repo whose root is itself the Rails app', () => {
    const repo = repoOf({
      'config/application.rb': 'module App; class Application; end; end\n',
      'app/models/cart.rb': 'class Cart\n  def items = Item.all\nend\n',
      'app/models/item.rb': 'class Item; end\n',
    });
    expect(extractRuby({ repo }).edges).toEqual([
      { from: 'app/models/cart.rb', to: 'app/models/item.rb' },
    ]);
  });

  it('reports a file Ruby cannot parse rather than reading it as one with no references', () => {
    const repo = repoOf({
      'config/application.rb': 'module App; class Application; end; end\n',
      'app/models/broken.rb': 'class Broken\n  def oops(\nend\n',
    });
    expect(() => extractRuby({ repo })).toThrow(ExtractionError);
    expect(() => extractRuby({ repo })).toThrow(/app\/models\/broken\.rb/);
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    expect(() => extractRuby({ repo: join(FIXTURE, 'nowhere') })).toThrow(/nowhere/);
  });
});
