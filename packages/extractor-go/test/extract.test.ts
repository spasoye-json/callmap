import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import { extractGo, GoExtractionError, removeGoExtractorBinary } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

afterAll(removeGoExtractorBinary);

const GO_MOD = 'module example.com/shop\n\ngo 1.22\n';

const repoOf = (files: Readonly<Record<string, string>>): string => {
  const repo = tempDir('callmap-go-repo-');
  for (const [path, text] of Object.entries({ 'go.mod': GO_MOD, ...files })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const goVersion = (): string => execFileSync('go', ['version'], { encoding: 'utf8' });

const lines = (...text: readonly string[]): string => `${text.join('\n')}\n`;

const MONEY = lines(
  'package money',
  '',
  '// Format writes cents as a price.',
  'func Format(cents int) string {',
  '\treturn "$" + digits(cents)',
  '}',
  '',
  'func digits(cents int) string { return "" }',
);

const CHECKOUT = lines(
  'package checkout',
  '',
  'import "example.com/shop/money"',
  '',
  'func Total(cents int) string {',
  '\treturn money.Format(cents)',
  '}',
);

describe('extractGo', () => {
  it('emits a graph document of Go that the core accepts, with the checker of the go that built it', () => {
    const document = extractGo({ repo: repoOf({ 'money/money.go': MONEY }) });
    expect(readGraphDocument(document)).toEqual(document);
    expect(document.language).toBe('go');
    expect(document.checker).toEqual({
      name: 'Go',
      version: /go version go(\S+)/.exec(goVersion())?.[1],
    });
  });

  it('anchors each function to its file and its lines, without its doc comment, and hashes its source', () => {
    const { functions } = extractGo({ repo: repoOf({ 'money/money.go': MONEY }) });
    expect(functions).toEqual([
      {
        id: 'money/money.go#Format',
        name: 'Format',
        file: 'money/money.go',
        firstLine: 4,
        lastLine: 6,
        sourceHash: sha256('func Format(cents int) string {\n\treturn "$" + digits(cents)\n}'),
      },
      {
        id: 'money/money.go#digits',
        name: 'digits',
        file: 'money/money.go',
        firstLine: 8,
        lastLine: 8,
        sourceHash: sha256('func digits(cents int) string { return "" }'),
      },
    ]);
  });

  it('ties a static call to the function it calls, in the same package and across packages', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({ 'money/money.go': MONEY, 'checkout/checkout.go': CHECKOUT }),
    });
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('names a method Type.Method, with no * for a pointer receiver and no type parameters', () => {
    const { functions } = extractGo({
      repo: repoOf({
        'cart/cart.go': lines(
          'package cart',
          '',
          'type Cart struct{ items []int }',
          '',
          'func (c Cart) Size() int { return len(c.items) }',
          '',
          'func (c *Cart) Add(item int) { c.items = append(c.items, item) }',
          '',
          'type Box[T any] struct{ item T }',
          '',
          'func (b *Box[T]) Item() T { return b.item }',
        ),
      }),
    });
    expect(functions.map(({ id, name }) => [id, name])).toEqual([
      ['cart/cart.go#Cart.Size', 'Cart.Size'],
      ['cart/cart.go#Cart.Add', 'Cart.Add'],
      ['cart/cart.go#Box.Item', 'Box.Item'],
    ]);
  });

  it('shows init as a function, and gives a repeated name the ~n suffix in source order', () => {
    const { functions } = extractGo({
      repo: repoOf({
        'boot/boot.go': lines(
          'package boot',
          '',
          'func init() {}',
          '',
          'func _() {}',
          '',
          'func init() {}',
          '',
          'func _() {}',
        ),
      }),
    });
    expect(functions.map(({ id }) => id)).toEqual([
      'boot/boot.go#init',
      'boot/boot.go#_',
      'boot/boot.go#init~2',
      'boot/boot.go#_~2',
    ]);
  });

  it('gives a call inside a func literal to the named function around it', () => {
    const { functions, calls } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'report/report.go': lines(
          'package report',
          '',
          'import "example.com/shop/money"',
          '',
          'func Lines(prices []int) func() string {',
          '	return func() string {',
          '		return money.Format(prices[0])',
          '	}',
          '}',
        ),
      }),
    });
    expect(functions.map(({ id }) => id)).toContain('report/report.go#Lines');
    expect(calls).toContainEqual({
      caller: 'report/report.go#Lines',
      callee: 'money/money.go#Format',
      line: 7,
    });
  });

  it('counts no conversion, no builtin and no func literal called where it is written as a call', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'money/money.go': lines(
          'package money',
          '',
          'type Cents int',
          '',
          'func Sum(prices []int) Cents {',
          '	total := Cents(len(prices))',
          '	func() { total++ }()',
          '	return total',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([]);
  });

  it('adds no call for a call into the standard library or into a file out of scope', () => {
    const { files, calls, openEnds } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'checkout/checkout.go': lines(
          'package checkout',
          '',
          'import (',
          '	"strings"',
          '',
          '	"example.com/shop/money"',
          ')',
          '',
          'func Total(cents int) string {',
          '	return strings.TrimSpace(money.Format(cents))',
          '}',
        ),
      }),
      scope: ['checkout/**'],
    });
    expect(files).toEqual(['checkout/checkout.go']);
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([]);
  });

  it('emits each file once, a test file too, with the calls of the tests', () => {
    const { files, functions, calls } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'money/money_test.go': lines('package money', '', 'func TestDigits() { digits(1) }'),
        'money/format_test.go': lines(
          'package money_test',
          '',
          'import "example.com/shop/money"',
          '',
          'func TestFormat() { money.Format(1) }',
        ),
        'checkout/checkout.go': CHECKOUT,
      }),
    });
    expect(files).toEqual([
      'checkout/checkout.go',
      'money/format_test.go',
      'money/money.go',
      'money/money_test.go',
    ]);
    expect(functions.map(({ id }) => id)).toEqual([
      'checkout/checkout.go#Total',
      'money/format_test.go#TestFormat',
      'money/money.go#Format',
      'money/money.go#digits',
      'money/money_test.go#TestDigits',
    ]);
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/format_test.go#TestFormat', callee: 'money/money.go#Format', line: 5 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
      { caller: 'money/money_test.go#TestDigits', callee: 'money/money.go#digits', line: 3 },
    ]);
  });

  it('leaves out a test file that the scope leaves out', () => {
    const { files } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'money/money_test.go': lines('package money', '', 'func TestDigits() { digits(1) }'),
      }),
      scope: ['!**/*_test.go'],
    });
    expect(files).toEqual(['money/money.go']);
  });

  it('leaves out a file that a build tag excludes', () => {
    const { files, functions } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'money/money_plan9.go': lines(
          '//go:build plan9',
          '',
          'package money',
          '',
          'func Plan9() {}',
        ),
        'money/money_never.go': lines(
          '//go:build never',
          '',
          'package money',
          '',
          'func Never() {}',
        ),
      }),
    });
    expect(files).toEqual(['money/money.go']);
    expect(functions.map(({ id }) => id)).toEqual([
      'money/money.go#Format',
      'money/money.go#digits',
    ]);
  });

  it('makes a call into code that does not load an open end with missing-module, and still reads the rest', () => {
    const document = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'checkout/checkout.go': lines(
          'package checkout',
          '',
          'import (',
          '	"example.com/shop/money"',
          '	"example.com/shop/gen"',
          ')',
          '',
          'func Total(cents int) string {',
          '	gen.Audit(cents)',
          '	newMock().Check()',
          '	return money.Format(cents)',
          '}',
        ),
      }),
    });
    expect(readGraphDocument(document)).toEqual(document);
    expect(document.openEnds).toEqual([
      {
        caller: 'checkout/checkout.go#Total',
        line: 9,
        expression: 'gen.Audit',
        reason: 'missing-module',
      },
      {
        caller: 'checkout/checkout.go#Total',
        line: 10,
        expression: 'newMock().Check',
        reason: 'missing-module',
      },
      {
        caller: 'checkout/checkout.go#Total',
        line: 10,
        expression: 'newMock',
        reason: 'missing-module',
      },
    ]);
    expect(document.calls).toContainEqual({
      caller: 'checkout/checkout.go#Total',
      callee: 'money/money.go#Format',
      line: 11,
    });
  });

  it('never changes go.mod or go.sum, even with -mod=mod in GOFLAGS', () => {
    const goMod = lines(
      'module example.com/shop',
      '',
      'go 1.22',
      '',
      'replace example.com/billing => ./billing',
    );
    const repo = repoOf({
      'go.mod': goMod,
      'billing/go.mod': lines('module example.com/billing', '', 'go 1.22'),
      'billing/invoice/invoice.go': lines('package invoice', '', 'func Send() {}'),
      'checkout/checkout.go': lines(
        'package checkout',
        '',
        'import "example.com/billing/invoice"',
        '',
        'func Pay() { invoice.Send() }',
      ),
    });
    const flags = process.env['GOFLAGS'];
    process.env['GOFLAGS'] = '-mod=mod';
    try {
      const { openEnds } = extractGo({ repo });
      expect(openEnds).toEqual([
        {
          caller: 'checkout/checkout.go#Pay',
          line: 5,
          expression: 'invoice.Send',
          reason: 'missing-module',
        },
      ]);
    } finally {
      if (flags === undefined) delete process.env['GOFLAGS'];
      else process.env['GOFLAGS'] = flags;
    }
    expect(readFileSync(join(repo, 'go.mod'), 'utf8')).toBe(goMod);
    expect(existsSync(join(repo, 'go.sum'))).toBe(false);
  });

  it('records the scope it was built under', () => {
    const scope = ['money/**', '!**/*_test.go'];
    expect(extractGo({ repo: repoOf({ 'money/money.go': MONEY }), scope }).scope).toEqual(scope);
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    expect(() => extractGo({ repo: join(tempDir('callmap-go-repo-'), 'nowhere') })).toThrow(
      GoExtractionError,
    );
  });
});

describe('a call through an interface', () => {
  const PAYER = lines(
    'package pay',
    '',
    'type Payer interface{ Pay(cents int) error }',
    '',
    'type Card struct{}',
    '',
    'func (c Card) Pay(cents int) error { return nil }',
    '',
    'type Wallet struct{}',
    '',
    'func (w *Wallet) Pay(cents int) error { return nil }',
    '',
    'type Coupon struct{}',
    '',
    'func (c Coupon) Pay(code string) error { return nil }',
  );

  it('is a one-of group over the method of each type whose T or *T implements the interface', () => {
    const document = extractGo({
      repo: repoOf({
        'pay/payer.go': PAYER,
        'shop/shop.go': lines(
          'package shop',
          '',
          'import "example.com/shop/pay"',
          '',
          'func Checkout(payer pay.Payer) error {',
          '\treturn payer.Pay(100)',
          '}',
        ),
      }),
    });
    expect(readGraphDocument(document)).toEqual(document);
    expect(document.calls).toEqual([
      {
        caller: 'shop/shop.go#Checkout',
        callee: 'pay/payer.go#Card.Pay',
        line: 6,
        group: 'shop/shop.go:6:15',
      },
      {
        caller: 'shop/shop.go#Checkout',
        callee: 'pay/payer.go#Wallet.Pay',
        line: 6,
        group: 'shop/shop.go:6:15',
      },
    ]);
    expect(document.openEnds).toEqual([]);
  });

  it('is a one-of group on a type parameter whose constraint is an interface of the repo', () => {
    const { calls } = extractGo({
      repo: repoOf({
        'pay/payer.go': PAYER,
        'shop/shop.go': lines(
          'package shop',
          '',
          'import "example.com/shop/pay"',
          '',
          'func Charge[P pay.Payer](payer P) error {',
          '\treturn payer.Pay(100)',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([
      {
        caller: 'shop/shop.go#Charge',
        callee: 'pay/payer.go#Card.Pay',
        line: 6,
        group: 'shop/shop.go:6:15',
      },
      {
        caller: 'shop/shop.go#Charge',
        callee: 'pay/payer.go#Wallet.Pay',
        line: 6,
        group: 'shop/shop.go:6:15',
      },
    ]);
  });

  it('holds a type of a test file, even when the interface names a type of its own package', () => {
    const { calls } = extractGo({
      repo: repoOf({
        'pay/payer.go': lines(
          'package pay',
          '',
          'type Cents int',
          '',
          'type Payer interface{ Pay(cents Cents) error }',
          '',
          'func Checkout(payer Payer) error { return payer.Pay(1) }',
        ),
        'pay/payer_test.go': lines(
          'package pay',
          '',
          'type fakePayer struct{}',
          '',
          'func (f fakePayer) Pay(cents Cents) error { return nil }',
        ),
        'card/card.go': lines(
          'package card',
          '',
          'import "example.com/shop/pay"',
          '',
          'type Card struct{}',
          '',
          'func (c Card) Pay(cents pay.Cents) error { return nil }',
        ),
      }),
    });
    expect(calls.map(({ callee, group }) => `${group} ${callee}`)).toEqual([
      'pay/payer.go:7:49 card/card.go#Card.Pay',
      'pay/payer.go:7:49 pay/payer_test.go#fakePayer.Pay',
    ]);
  });

  it('ties a promoted method to the method of the embedded type, and holds it once in a group', () => {
    const { calls } = extractGo({
      repo: repoOf({
        'pay/payer.go': PAYER,
        'shop/gift.go': lines(
          'package shop',
          '',
          'import "example.com/shop/pay"',
          '',
          'type Gift struct{ pay.Card }',
          '',
          'func Send(gift Gift, payer pay.Payer) {',
          '\tgift.Pay(5)',
          '\tpayer.Pay(5)',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([
      { caller: 'shop/gift.go#Send', callee: 'pay/payer.go#Card.Pay', line: 8 },
      {
        caller: 'shop/gift.go#Send',
        callee: 'pay/payer.go#Card.Pay',
        line: 9,
        group: 'shop/gift.go:9:8',
      },
      {
        caller: 'shop/gift.go#Send',
        callee: 'pay/payer.go#Wallet.Pay',
        line: 9,
        group: 'shop/gift.go:9:8',
      },
    ]);
  });

  it('ties a call of a generic function to its declaration, and not to each instantiation', () => {
    const { functions, calls } = extractGo({
      repo: repoOf({
        'pay/payer.go': PAYER,
        'shop/shop.go': lines(
          'package shop',
          '',
          'import "example.com/shop/pay"',
          '',
          'func First[T any](items []T) T { return items[0] }',
          '',
          'func Pick() {',
          '\tFirst([]int{1})',
          '\tFirst[pay.Card]([]pay.Card{{}})',
          '}',
        ),
      }),
    });
    expect(functions.filter(({ file }) => file === 'shop/shop.go').map(({ id }) => id)).toEqual([
      'shop/shop.go#First',
      'shop/shop.go#Pick',
    ]);
    expect(calls).toEqual([
      { caller: 'shop/shop.go#Pick', callee: 'shop/shop.go#First', line: 8 },
      { caller: 'shop/shop.go#Pick', callee: 'shop/shop.go#First', line: 9 },
    ]);
  });

  it('is an open end with no-implementation when no type in scope implements the interface', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/payer.go': PAYER,
        'pay/refund.go': lines(
          'package pay',
          '',
          'type Refunder interface{ Refund(cents int) error }',
          '',
          'func Back(refunder Refunder) error { return refunder.Refund(1) }',
        ),
      }),
      scope: ['pay/refund.go'],
    });
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([
      {
        caller: 'pay/refund.go#Back',
        line: 5,
        expression: 'refunder.Refund',
        reason: 'no-implementation',
      },
    ]);
  });

  it('adds no call for a call through a library interface, even when a type of the repo implements it', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'log/log.go': lines(
          'package log',
          '',
          'import "io"',
          '',
          'type Line struct{}',
          '',
          'func (l Line) Write(text []byte) (int, error) { return len(text), nil }',
          '',
          'func Print(out io.Writer) { out.Write(nil) }',
        ),
      }),
    });
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([]);
  });
});
