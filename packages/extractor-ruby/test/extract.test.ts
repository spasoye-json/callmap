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
const DISCOUNTABLE = 'shop/app/models/concerns/discountable.rb';
const ORDERS_CONTROLLER = 'shop/app/controllers/admin/orders_controller.rb';
const BILLING_ORDER = 'billing/app/models/order.rb';
const INVOICES_CONTROLLER = 'billing/app/controllers/invoices_controller.rb';
const PRICING = 'gems/pricing/lib/pricing.rb';

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
      'Order.from_payload',
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

  it('ties a call on self to a method that a concern of the class defines', () => {
    expect(callsOf(extract())).toContain(
      `${ORDER}#Order#discount_of ${DISCOUNTABLE}#Discountable#discount 26`,
    );
  });

  it('ties a call on self to a method of a second body of a reopened library class', () => {
    expect(callsOf(extract())).toContain(
      'shop/config/initializers/slug.rb#String#slugify shop/lib/core_ext/string.rb#String#squish_dashes 3',
    );
  });

  it('ties a call on self through the superclasses of the class', () => {
    expect(callsOf(extract())).toContain(
      `${ORDERS_CONTROLLER}#Admin::OrdersController#index shop/app/controllers/application_controller.rb#ApplicationController#authorize 4`,
    );
  });

  it('gives a library call for a call on self that reaches ActionController::Base first', () => {
    const document = extract();
    const lines = [...document.calls, ...document.openEnds]
      .filter(({ caller }) => caller === `${ORDERS_CONTROLLER}#Admin::OrdersController#show`)
      .map(({ line }) => line);
    expect(lines).toEqual([10]);
  });

  it('ties super to the method of the same name in the next ancestor of the repo', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform shop/app/jobs/application_job.rb#ApplicationJob#perform 5`,
    );
  });

  it('gives a library call for super when a framework module comes before the method of the repo', () => {
    const document = extract();
    expect(
      [...document.calls, ...document.openEnds].filter(({ caller }) =>
        caller.startsWith('shop/app/jobs/refund_job.rb'),
      ),
    ).toEqual([]);
  });

  it('ties a call on self to a prepended module before the class, and to an extended module on the class', () => {
    const repo = repoOf({
      'lib/loud.rb': 'module Loud\n  def greet; end\nend\n',
      'lib/finders.rb': 'module Finders\n  def find_all; end\nend\n',
      'lib/person.rb': [
        'class Person',
        '  prepend Loud',
        '  extend Finders',
        '',
        '  def greet; end',
        '',
        '  def hello',
        '    greet',
        '  end',
        '',
        '  def self.load',
        '    find_all',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    expect(callsOf(extractRuby({ repo }))).toEqual([
      'lib/person.rb#Person#hello lib/loud.rb#Loud#greet 8',
      'lib/person.rb#Person.load lib/finders.rb#Finders#find_all 12',
    ]);
  });

  it('ties a call on the class of a Rails concern to a method of its class_methods block', () => {
    const repo = repoOf({
      'app/models/concerns/searchable.rb': [
        'module Searchable',
        '  extend ActiveSupport::Concern',
        '',
        '  class_methods do',
        '    def search; end',
        '  end',
        'end',
        '',
      ].join('\n'),
      'app/models/post.rb':
        'class Post\n  include Searchable\n\n  def self.top\n    search\n  end\nend\n',
    });
    expect(callsOf(extractRuby({ repo }))).toEqual([
      'app/models/post.rb#Post.top app/models/concerns/searchable.rb#Searchable::ClassMethods#search 5',
    ]);
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
      ]),
    );
  });

  it('gives an open end with other for a call on self that finds no def in a class chain of the repo', () => {
    const repo = repoOf({
      'lib/cart.rb': 'class Cart\n  def add\n    total\n  end\nend\n',
      'lib/order.rb': 'class Order\n  def total; end\nend\n',
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual(['lib/cart.rb#Cart#add 3 total other']);
  });

  it('gives a library call for a method that has_many makes, even when a def of the repo has its name', () => {
    const document = extract();
    expect(
      [...document.calls, ...document.openEnds].filter(
        ({ caller }) => caller === `${DISCOUNTABLE}#Discountable#discount`,
      ),
    ).toEqual([]);
  });

  it('gives a library call for a method that attr_reader or delegate makes', () => {
    const repo = repoOf({
      'lib/axis.rb': 'class Axis\n  def x; end\n\n  def total; end\nend\n',
      'lib/point.rb': [
        'class Point',
        '  attr_reader :x',
        '  delegate :total, to: :axis',
        '',
        '  def norm',
        '    x + total',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect([...document.calls, ...document.openEnds]).toEqual([]);
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

  it('ties a constant of a gem outside Rails through the index of its load unit', () => {
    expect(callsOf(extract())).toContain(
      `${PRICING}#Pricing.quote gems/pricing/lib/pricing/tax.rb#Pricing::Tax.rate 3`,
    );
  });

  it('keeps the constants of 2 Rails apps and a gem apart', () => {
    const document = extract();
    expect(callsOf(document)).toContain(
      `${INVOICES_CONTROLLER}#InvoicesController#create ${BILLING_ORDER}#Order.from_payload 3`,
    );
    expect(callsOf(document)).not.toContain(
      `${INVOICES_CONTROLLER}#InvoicesController#create ${ORDER}#Order.from_payload 3`,
    );
    expect(openEndsOf(document)).toEqual(
      expect.arrayContaining([
        `${ORDERS_CONTROLLER}#Admin::OrdersController#show 10 Invoice.for missing-module`,
        `${PRICING}#Pricing.recent 7 Order.recent missing-module`,
        `${RELEASE}#Release#run 3 Order.count missing-module`,
      ]),
    );
  });

  it('gives a library call for a callee whose file the scope leaves out', () => {
    const document = extract('shop/app/models/report.rb');
    expect(callsOf(document)).toEqual([`${REPORT}#Report#render ${REPORT}#Report#rows 7`]);
    expect(document.openEnds).toEqual([]);
  });
});

const oneOfCallsOf = (document: GraphDocument): readonly string[] =>
  document.calls.map(
    ({ caller, callee, line, group }) => `${caller} ${callee} ${line} ${group ?? 'no group'}`,
  );

describe('the one-of groups of extractRuby', () => {
  it('gives a one-of group over each including class for a call on self in a concern with no def of its name', () => {
    const repo = repoOf({
      'app/models/concerns/billable.rb': [
        'module Billable',
        '  def invoice',
        '    total',
        '  end',
        'end',
        '',
      ].join('\n'),
      'app/models/order.rb': 'class Order\n  include Billable\n\n  def total; end\nend\n',
      'app/models/refund.rb': 'class Refund\n  include Billable\n\n  def total; end\nend\n',
      'app/models/cart.rb': 'class Cart\n  def total; end\nend\n',
    });
    const group = 'app/models/concerns/billable.rb:3:5';
    expect(oneOfCallsOf(extractRuby({ repo }))).toEqual([
      `app/models/concerns/billable.rb#Billable#invoice app/models/order.rb#Order#total 3 ${group}`,
      `app/models/concerns/billable.rb#Billable#invoice app/models/refund.rb#Refund#total 3 ${group}`,
    ]);
  });

  it('gives a one-of group over the overrides of the subclasses for a call to an abstract method', () => {
    const repo = repoOf({
      'lib/exporter.rb': [
        'class Exporter',
        '  def run',
        '    write',
        '  end',
        '',
        '  def write',
        '    raise NotImplementedError, "a subclass writes"',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/csv_exporter.rb': 'class CsvExporter < Exporter\n  def write; end\nend\n',
      'lib/json_exporter.rb': 'class JsonExporter < Exporter\n  def write = nil\nend\n',
      'lib/null_exporter.rb': 'class NullExporter < Exporter\nend\n',
    });
    const group = 'lib/exporter.rb:3:5';
    expect(oneOfCallsOf(extractRuby({ repo }))).toEqual([
      `lib/exporter.rb#Exporter#run lib/csv_exporter.rb#CsvExporter#write 3 ${group}`,
      `lib/exporter.rb#Exporter#run lib/json_exporter.rb#JsonExporter#write 3 ${group}`,
    ]);
  });

  it('ties a call to a concrete method that a subclass overrides to the one method', () => {
    const repo = repoOf({
      'lib/exporter.rb': 'class Exporter\n  def run\n    write\n  end\n\n  def write; end\nend\n',
      'lib/csv_exporter.rb': 'class CsvExporter < Exporter\n  def write; end\nend\n',
    });
    expect(oneOfCallsOf(extractRuby({ repo }))).toEqual([
      'lib/exporter.rb#Exporter#run lib/exporter.rb#Exporter#write 3 no group',
    ]);
  });

  it('gives no-implementation for a one-of group with no member in scope', () => {
    const repo = repoOf({
      'lib/billable.rb': 'module Billable\n  def invoice\n    total\n  end\nend\n',
      'lib/cart.rb': 'class Cart\n  def total; end\nend\n',
      'lib/exporter.rb': [
        'class Exporter',
        '  def run',
        '    write',
        '  end',
        '',
        '  def write',
        '    raise(NotImplementedError)',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/csv_exporter.rb': 'class CsvExporter < Exporter\n  def write; end\nend\n',
    });
    const document = extractRuby({ repo, scope: ['lib/billable.rb', 'lib/exporter.rb'] });
    expect(document.calls).toEqual([]);
    expect(openEndsOf(document)).toEqual([
      'lib/billable.rb#Billable#invoice 3 total no-implementation',
      'lib/exporter.rb#Exporter#run 3 write no-implementation',
    ]);
  });
});

const APPLICATION = 'module Store\n  class Application < Rails::Application\n  end\nend\n';

describe('the Zeitwerk names of a Rails app', () => {
  it('names a constant with no body after its file, with the inflections of the app', () => {
    const repo = repoOf({
      'config/application.rb': APPLICATION,
      'config/initializers/inflections.rb':
        'ActiveSupport::Inflector.inflections(:en) do |inflect|\n  inflect.acronym "API"\nend\n',
      'app/models/api_client.rb': 'APIClient = Struct.new(:key)\n',
      'app/models/socket.rb': 'class Socket\n  def connect; end\nend\n',
      'app/models/sync.rb':
        'class Sync\n  def run\n    APIClient.connect\n    ApiClient.connect\n  end\nend\n',
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual([
      'app/models/sync.rb#Sync#run 4 ApiClient.connect missing-module',
    ]);
  });

  it('names the constants of lib when the app autoloads it', () => {
    const files = {
      'lib/payments/gateway.rb': 'Payments::Gateway = Class.new\n',
      'app/models/order.rb':
        'class Order\n  def pay\n    Payments::Gateway.connect\n  end\n\n  def connect; end\nend\n',
    };
    const autoloaded = repoOf({
      ...files,
      'config/application.rb': APPLICATION.replace(
        'Rails::Application\n',
        'Rails::Application\n    config.autoload_lib(ignore: %w[assets tasks])\n',
      ),
    });
    const required = repoOf({ ...files, 'config/application.rb': APPLICATION });
    expect(openEndsOf(extractRuby({ repo: autoloaded }))).toEqual([]);
    expect(openEndsOf(extractRuby({ repo: required }))).toEqual([
      'app/models/order.rb#Order#pay 3 Payments::Gateway.connect missing-module',
    ]);
  });

  it('ties a constant of an engine that the Gemfile of the app names by its path, and keeps the app out of the engine', () => {
    const repo = repoOf({
      Gemfile: 'source "https://rubygems.org"\n\ngem "payments", path: "engines/payments"\n',
      'config/application.rb': APPLICATION,
      'engines/payments/payments.gemspec':
        'Gem::Specification.new { |spec| spec.name = "payments" }\n',
      'engines/payments/app/models/payments/charge.rb':
        'module Payments\n  class Charge\n    def self.create; end\n  end\nend\n',
      'engines/payments/app/models/payments/refund.rb':
        'module Payments\n  class Refund\n    def self.issue\n      Order.find_open\n    end\n  end\nend\n',
      'app/models/order.rb':
        'class Order\n  def self.find_open; end\n\n  def pay\n    Payments::Charge.create\n  end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'app/models/order.rb#Order#pay engines/payments/app/models/payments/charge.rb#Payments::Charge.create 5',
    ]);
    expect(openEndsOf(document)).toEqual([
      'engines/payments/app/models/payments/refund.rb#Payments::Refund.issue 4 Order.find_open missing-module',
    ]);
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
      'shop/config/initializers/slug.rb',
      'shop/lib/core_ext/string.rb',
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
