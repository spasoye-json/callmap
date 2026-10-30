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
    const repo = repoOf({
      'lib/label.rb': 'class Label\n  def print; end\nend\n',
      'lib/printer.rb': 'class Printer\n  def run(label)\n    label.print\n  end\nend\n',
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual([
      'lib/printer.rb#Printer#run 3 label.print untyped',
    ]);
  });

  it('ties a call on Foo.new with arguments to the instance method of Foo', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform ${LABEL}#Shipping::Label#print 4`,
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

describe('the metaprogramming of extractRuby', () => {
  it('names a method of module_function Mod.x, and ties a call through self in the module to it', () => {
    const repo = repoOf({
      'lib/units.rb': [
        'module Units',
        '  def to_cm; end',
        '  module_function :to_cm',
        '  module_function def to_in; end',
        '',
        '  module_function',
        '',
        '  def to_mm',
        '    to_cm',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/ruler.rb': 'class Ruler\n  def mark\n    Units.to_mm\n  end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(namesIn(document, 'lib/units.rb')).toEqual([
      'Units.to_cm',
      'Units.to_in',
      'Units.to_mm',
    ]);
    expect(callsOf(document)).toEqual([
      'lib/ruler.rb#Ruler#mark lib/units.rb#Units.to_mm 3',
      'lib/units.rb#Units.to_mm lib/units.rb#Units.to_cm 9',
    ]);
  });

  it('names a method of define_method with a literal name at the line of that call', () => {
    const repo = repoOf({
      'lib/flags.rb': [
        'class Flags',
        '  define_method(:on) do',
        '    reset',
        '  end',
        '',
        '  class << self',
        '    define_method "load" do',
        '      new',
        '    end',
        '  end',
        '',
        '  %i[a b].each { |flag| define_method(flag) { reset } }',
        '',
        '  def reset; end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(
      document.functions.map(({ name, firstLine, lastLine }) => `${name} ${firstLine}-${lastLine}`),
    ).toEqual(['Flags#on 2-4', 'Flags.load 7-9', 'Flags#reset 14-14']);
    expect(callsOf(document)).toEqual(['lib/flags.rb#Flags#on lib/flags.rb#Flags#reset 3']);
  });

  it('names a def in the block of a constant from Struct.new, Data.define or Class.new as a method of that constant', () => {
    const repo = repoOf({
      'lib/shapes.rb': [
        'module Shapes',
        '  Point = Struct.new(:x, :y) do',
        '    def norm; end',
        '  end',
        '',
        '  Size = Data.define(:width) do',
        '    def area',
        '      norm',
        '    end',
        '  end',
        '',
        '  Square = Class.new(Base) do',
        '    def draw',
        '      outline',
        '      Point.new.norm',
        '      Size.area',
        '    end',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/shapes/base.rb': 'module Shapes\n  class Base\n    def outline; end\n  end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(namesIn(document, 'lib/shapes.rb')).toEqual([
      'Shapes::Point#norm',
      'Shapes::Size#area',
      'Shapes::Square#draw',
    ]);
    expect(callsOf(document)).toEqual([
      'lib/shapes.rb#Shapes::Square#draw lib/shapes/base.rb#Shapes::Base#outline 14',
      'lib/shapes.rb#Shapes::Square#draw lib/shapes.rb#Shapes::Point#norm 15',
    ]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties send, public_send and try with a literal name like a direct call, and gives dynamic-key for a computed name', () => {
    const repo = repoOf({
      'lib/robot.rb': [
        'class Robot',
        '  def self.build; end',
        '',
        '  def step(name, arm)',
        '    send(:turn, 90)',
        '    Robot.public_send "build"',
        '    arm.try(:turn)',
        '    send(name)',
        '    arm.public_send(name, 1)',
        '  end',
        '',
        '  def turn(degrees = 0); end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/robot.rb#Robot#step lib/robot.rb#Robot#turn 5',
      'lib/robot.rb#Robot#step lib/robot.rb#Robot.build 6',
    ]);
    expect(openEndsOf(document)).toEqual([
      'lib/robot.rb#Robot#step 7 arm.try untyped',
      'lib/robot.rb#Robot#step 8 send dynamic-key',
      'lib/robot.rb#Robot#step 9 arm.public_send dynamic-key',
    ]);
  });

  it('gives function-value for yield and for a call of a block, a callable or a method object', () => {
    const repo = repoOf({
      'lib/hooks.rb': [
        'class Hooks',
        '  def run(callable, service, &block)',
        '    yield',
        '    yield(1)',
        '    block.call(2)',
        '    callable.()',
        '    method(:run).call',
        '    service.call',
        '    service.method(:call).call',
        '    self.method(:run).call',
        '  end',
        '',
        '  def call; end',
        'end',
        '',
      ].join('\n'),
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual([
      'lib/hooks.rb#Hooks#run 3 yield function-value',
      'lib/hooks.rb#Hooks#run 4 yield function-value',
      'lib/hooks.rb#Hooks#run 5 block.call function-value',
      'lib/hooks.rb#Hooks#run 6 callable.() function-value',
      'lib/hooks.rb#Hooks#run 7 method(:run).call function-value',
      'lib/hooks.rb#Hooks#run 8 service.call untyped',
      'lib/hooks.rb#Hooks#run 9 service.method(:call).call function-value',
      'lib/hooks.rb#Hooks#run 10 self.method(:run).call function-value',
    ]);
  });

  it('gives dynamic-key for send with a splat, and reads a mixin or a macro with a splat', () => {
    const repo = repoOf({
      'lib/robot.rb': [
        'class Robot',
        '  include(*MODULES)',
        '  attr_reader :arm, *PARTS',
        '',
        '  def step(*args)',
        '    send(*args)',
        '    public_send(:turn, *args)',
        '  end',
        '',
        '  def turn; end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual(['lib/robot.rb#Robot#step lib/robot.rb#Robot#turn 7']);
    expect(openEndsOf(document)).toEqual(['lib/robot.rb#Robot#step 6 send dynamic-key']);
  });

  it('gives other for a call on self that only method_missing could answer', () => {
    const repo = repoOf({
      'lib/ghost.rb': [
        'class Ghost',
        '  def method_missing(name, *args)',
        '    super',
        '  end',
        '',
        '  def haunt',
        '    vanish',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/magician.rb': 'class Magician\n  def vanish; end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual(['lib/ghost.rb#Ghost#haunt 7 vanish other']);
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

describe('the receivers of a known class in extractRuby', () => {
  it('ties a call on a literal to a method that the repo adds to its library class', () => {
    const repo = repoOf({
      'lib/core_ext.rb': [
        'class String',
        '  def slugify; end',
        'end',
        '',
        'class Array',
        '  def second; end',
        'end',
        '',
        'class Hash',
        '  def deep_keys; end',
        'end',
        '',
        'class Symbol',
        '  def to_label; end',
        'end',
        '',
        'class Integer',
        '  def minutes; end',
        'end',
        '',
      ].join('\n'),
      'lib/page.rb': [
        'class Page',
        '  def render',
        '    "Hello world".slugify',
        "    'x'.slugify",
        '    [1, 2].second',
        '    %w[a b].second',
        '    { a: 1 }.deep_keys',
        '    :title.to_label',
        '    5.minutes',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/page.rb#Page#render lib/core_ext.rb#String#slugify 3',
      'lib/page.rb#Page#render lib/core_ext.rb#String#slugify 4',
      'lib/page.rb#Page#render lib/core_ext.rb#Array#second 5',
      'lib/page.rb#Page#render lib/core_ext.rb#Array#second 6',
      'lib/page.rb#Page#render lib/core_ext.rb#Hash#deep_keys 7',
      'lib/page.rb#Page#render lib/core_ext.rb#Symbol#to_label 8',
      'lib/page.rb#Page#render lib/core_ext.rb#Integer#minutes 9',
    ]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('gives a library call for a call on a literal whose class the repo does not reopen, even when a def of the repo has its name', () => {
    const repo = repoOf({
      'lib/page.rb': [
        'class Page',
        '  def render',
        '    "x".upcase',
        '    [].first',
        '  end',
        '',
        '  def upcase; end',
        '  def first; end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties a call on Foo.new to the instance method of Foo, and keeps a value that its own new makes untyped', () => {
    const repo = repoOf({
      'lib/billing/invoice.rb': [
        'module Billing',
        '  class Invoice',
        '    def total; end',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/cache.rb': 'class Cache\n  def self.new; end\n\n  def total; end\nend\n',
      'lib/billing/run.rb': [
        'module Billing',
        '  class Run',
        '    def call',
        '      Invoice.new.total',
        '      Invoice.new(1, 2).total',
        '      Billing::Invoice.new { 1 }.total',
        '      Cache.new.total',
        '      Missing.new.total',
        '    end',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/billing/run.rb#Billing::Run#call lib/billing/invoice.rb#Billing::Invoice#total 4',
      'lib/billing/run.rb#Billing::Run#call lib/billing/invoice.rb#Billing::Invoice#total 5',
      'lib/billing/run.rb#Billing::Run#call lib/billing/invoice.rb#Billing::Invoice#total 6',
      'lib/billing/run.rb#Billing::Run#call lib/cache.rb#Cache.new 7',
    ]);
    expect(openEndsOf(document)).toEqual([
      'lib/billing/run.rb#Billing::Run#call 7 Cache.new.total untyped',
      'lib/billing/run.rb#Billing::Run#call 8 Missing.new.total untyped',
    ]);
  });
});

const TYPE_FLOW_REPO = {
  'lib/invoice.rb': 'class Invoice\n  def total; end\nend\n',
  'lib/refund.rb': 'class Refund\n  def total; end\nend\n',
  'lib/core_ext.rb': 'class String\n  def slugify; end\nend\n',
};

describe('the local type flow of extractRuby', () => {
  it('ties a call on a local variable that each write of the def sets from Foo.new or a literal', () => {
    const repo = repoOf({
      ...TYPE_FLOW_REPO,
      'lib/run.rb': [
        'class Run',
        '  def call(given, items)',
        '    invoice = Invoice.new',
        '    invoice.total',
        '    items.each { invoice.total }',
        '    name = "x"',
        '    name.slugify',
        '    cached ||= Invoice.new',
        '    cached.total',
        '    either = Invoice.new',
        '    either = Refund.new',
        '    either.total',
        '    given.total',
        '    first, second = Invoice.new, Invoice.new',
        '    first.total',
        '    shadowed = Invoice.new; items.each { |shadowed| shadowed.total }',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/run.rb#Run#call lib/invoice.rb#Invoice#total 4',
      'lib/run.rb#Run#call lib/invoice.rb#Invoice#total 5',
      'lib/run.rb#Run#call lib/core_ext.rb#String#slugify 7',
      'lib/run.rb#Run#call lib/invoice.rb#Invoice#total 9',
    ]);
    expect(openEndsOf(document)).toEqual([
      'lib/run.rb#Run#call 12 either.total untyped',
      'lib/run.rb#Run#call 13 given.total untyped',
      'lib/run.rb#Run#call 15 first.total untyped',
      'lib/run.rb#Run#call 16 shadowed.total untyped',
    ]);
  });

  it('ties a call on an instance variable that one method of the class alone sets from Foo.new', () => {
    const repo = repoOf({
      ...TYPE_FLOW_REPO,
      'lib/checkout.rb': [
        'class Checkout',
        '  attr_accessor :note',
        '',
        '  def initialize',
        '    @invoice = Invoice.new',
        '    @note = Invoice.new',
        '  end',
        '',
        '  def refund',
        '    @refund ||= Refund.new',
        '  end',
        '',
        '  def run',
        '    @invoice.total',
        '    @refund.total',
        '    @note.total',
        '    @other.total',
        '  end',
        '',
        '  def first = @other = Invoice.new',
        '  def second = @other = Invoice.new',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/checkout.rb#Checkout#run lib/invoice.rb#Invoice#total 14',
      'lib/checkout.rb#Checkout#run lib/refund.rb#Refund#total 15',
    ]);
    expect(openEndsOf(document)).toEqual([
      'lib/checkout.rb#Checkout#run 16 @note.total untyped',
      'lib/checkout.rb#Checkout#run 17 @other.total untyped',
    ]);
  });

  it('keeps an instance variable untyped when a subclass, a superclass or a module of the object writes it too', () => {
    const repo = repoOf({
      ...TYPE_FLOW_REPO,
      'lib/base.rb': [
        'class Base',
        '  def setup',
        '    @x = Invoice.new',
        '  end',
        '',
        '  def run',
        '    @x.total',
        '  end',
        'end',
        '',
      ].join('\n'),
      'lib/child.rb': 'class Child < Base\n  def setup\n    @x = Refund.new\n  end\nend\n',
      'lib/parent.rb': 'class Parent\n  def prepare\n    @y = Refund.new\n  end\nend\n',
      'lib/settable.rb': 'module Settable\n  def assign\n    @z = Refund.new\n  end\nend\n',
      'lib/writable.rb': 'module Writable\n  attr_writer :w\nend\n',
      'lib/heir.rb': [
        'class Heir < Parent',
        '  include Settable',
        '  include Writable',
        '',
        '  def initialize',
        '    @y = Invoice.new',
        '    @z = Invoice.new',
        '    @w = Invoice.new',
        '  end',
        '',
        '  def run',
        '    @y.total',
        '    @z.total',
        '    @w.total',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([
      'lib/base.rb#Base#run 7 @x.total untyped',
      'lib/heir.rb#Heir#run 12 @y.total untyped',
      'lib/heir.rb#Heir#run 13 @z.total untyped',
      'lib/heir.rb#Heir#run 14 @w.total untyped',
    ]);
  });

  it('ties a call on a value that a finder of the library makes, when the class is a model', () => {
    const repo = repoOf({
      'lib/application_record.rb': 'class ApplicationRecord < ActiveRecord::Base\nend\n',
      'lib/account.rb': 'class Account < ApplicationRecord\n  def suspend; end\nend\n',
      'lib/vault.rb': [
        'class Vault < ApplicationRecord',
        '  def self.create; end',
        '',
        '  def suspend; end',
        'end',
        '',
      ].join('\n'),
      'lib/ledger.rb': 'class Ledger\n  def self.find(id); end\n\n  def suspend; end\nend\n',
      'lib/admin.rb': [
        'class Admin',
        '  def load(id)',
        '    @account ||= Account.find(id)',
        '  end',
        '',
        '  def run(id)',
        '    Account.find(id).suspend',
        '    account = Account.find_by name: id',
        '    account.suspend',
        '    @account.suspend',
        '    Account.where(id).suspend',
        '    Vault.create.suspend',
        '    Ledger.find(id).suspend',
        '  end',
        'end',
        '',
      ].join('\n'),
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'lib/admin.rb#Admin#run lib/account.rb#Account#suspend 7',
      'lib/admin.rb#Admin#run lib/account.rb#Account#suspend 9',
      'lib/admin.rb#Admin#run lib/account.rb#Account#suspend 10',
      'lib/admin.rb#Admin#run lib/vault.rb#Vault.create 12',
      'lib/admin.rb#Admin#run lib/ledger.rb#Ledger.find 13',
    ]);
    expect(openEndsOf(document)).toEqual([
      'lib/admin.rb#Admin#run 11 Account.where(id).suspend untyped',
      'lib/admin.rb#Admin#run 12 Vault.create.suspend untyped',
      'lib/admin.rb#Admin#run 13 Ledger.find(id).suspend untyped',
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
      'lib/payments/gateway.rb': 'Payments::Gateway = ActiveMerchant::Gateway\n',
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
