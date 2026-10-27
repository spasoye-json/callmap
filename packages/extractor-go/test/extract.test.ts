import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import {
  extractGo,
  GoExtractionError,
  goExtractorBinary,
  removeGoExtractorBinary,
} from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

afterAll(removeGoExtractorBinary);
afterEach(() => {
  vi.unstubAllEnvs();
});

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

/** The hash that go.sum holds, as `Hash1` of `golang.org/x/mod/sumdb/dirhash` computes it. */
const h1 = (files: Readonly<Record<string, string>>): string => {
  const summary = Object.entries(files)
    .sort(([first], [second]) => (first < second ? -1 : 1))
    .map(([name, text]) => `${sha256(text)}  ${name}\n`)
    .join('');
  return `h1:${createHash('sha256').update(summary).digest('base64')}`;
};

interface ModuleCache {
  readonly dir: string;
  readonly goSum: string;
}

/**
 * A module cache that holds one module, as the go tool leaves it after a download, and the go.sum
 * lines that let a repo require it. The go tool reads the module from the cache without its zip.
 */
const moduleCacheOf = (
  module: string,
  version: string,
  files: Readonly<Record<string, string>>,
): ModuleCache => {
  const dir = tempDir('callmap-go-cache-');
  const extracted = join(dir, `${module}@${version}`);
  const download = join(dir, 'cache/download', module, '@v');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(extracted, path)), { recursive: true });
    writeFileSync(join(extracted, path), text);
  }
  const goMod = files['go.mod'] ?? '';
  const zipHash = h1(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [`${module}@${version}/${path}`, text]),
    ),
  );
  mkdirSync(download, { recursive: true });
  writeFileSync(join(download, `${version}.mod`), goMod);
  writeFileSync(join(download, `${version}.ziphash`), zipHash);
  return {
    dir,
    goSum: lines(
      `${module} ${version} ${zipHash}`,
      `${module} ${version}/go.mod ${h1({ 'go.mod': goMod })}`,
    ),
  };
};

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

const MONEY_GO_MOD = lines('module example.com/money', '', 'go 1.22');

const CHECKOUT_OF_MONEY_MODULE = lines(
  'package checkout',
  '',
  'import "example.com/money"',
  '',
  'func Total(cents int) string {',
  '\treturn money.Format(cents)',
  '}',
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

  it('type-checks no test file when the scope leaves out the tests, so a library type that only a test imports implements no interface', () => {
    const repo = repoOf({
      'size/size.go': lines(
        'package size',
        '',
        'type Sizer interface{ Size() int64 }',
        '',
        'func Measure(sizer Sizer) int64 { return sizer.Size() }',
      ),
      'size/size_test.go': lines(
        'package size',
        '',
        'import "strings"',
        '',
        'func TestMeasure() { Measure(strings.NewReader("")) }',
      ),
    });
    expect(extractGo({ repo }).openEnds).toEqual([]);
    expect(extractGo({ repo, scope: ['!**/*_test.go'] }).openEnds).toEqual([
      {
        caller: 'size/size.go#Measure',
        line: 5,
        expression: 'sizer.Size',
        reason: 'no-implementation',
      },
    ]);
  });

  it('type-checks only the packages in scope, so a type of a package that no package in scope imports implements no interface', () => {
    const repo = repoOf({
      'size/size.go': lines(
        'package size',
        '',
        'type Sizer interface{ Size() int64 }',
        '',
        'func Measure(sizer Sizer) int64 { return sizer.Size() }',
      ),
      'disk/disk.go': lines(
        'package disk',
        '',
        'type File struct{}',
        '',
        'func (File) Size() int64 { return 0 }',
      ),
    });
    expect(extractGo({ repo, scope: ['size/**'] }).openEnds).toEqual([
      {
        caller: 'size/size.go#Measure',
        line: 5,
        expression: 'sizer.Size',
        reason: 'no-implementation',
      },
    ]);
  });

  it('leaves out a directory whose name starts with _, as the go tool does', () => {
    const { files } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        '_examples/main.go': lines('package main', '', 'func main() {}'),
      }),
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

  it('emits a file that imports C at its own path and lines, with its functions and their calls', () => {
    const { files, functions, calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          '// int twice(int cents) { return 2 * cents; }',
          'import "C"',
          '',
          'func Pay(cents int) int {',
          '	return charge(int(C.twice(C.int(cents))))',
          '}',
          '',
          'func charge(cents int) int { return cents }',
        ),
        'pay/refund.go': lines('package pay', '', 'func Refund() { Pay(1) }'),
      }),
    });
    expect(files).toEqual(['pay/pay.go', 'pay/refund.go']);
    expect(functions.filter(({ file }) => file === 'pay/pay.go')).toEqual([
      {
        id: 'pay/pay.go#Pay',
        name: 'Pay',
        file: 'pay/pay.go',
        firstLine: 6,
        lastLine: 8,
        sourceHash: sha256(
          'func Pay(cents int) int {\n\treturn charge(int(C.twice(C.int(cents))))\n}',
        ),
      },
      {
        id: 'pay/pay.go#charge',
        name: 'charge',
        file: 'pay/pay.go',
        firstLine: 10,
        lastLine: 10,
        sourceHash: sha256('func charge(cents int) int { return cents }'),
      },
    ]);
    expect(calls).toEqual([
      { caller: 'pay/pay.go#Pay', callee: 'pay/pay.go#charge', line: 7 },
      { caller: 'pay/refund.go#Refund', callee: 'pay/pay.go#Pay', line: 3 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('takes the source and the expressions of a file that imports C from that file, even where cgo rewrites a call into C with a pointer', () => {
    const free = 'func Free(p unsafe.Pointer) { C.free(p) }';
    const pay = 'func Pay(k string) { p := C.malloc(1); defer C.free(p); hooks[k]() }';
    const { functions, calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': [
          'package pay',
          '',
          '// #include <stdlib.h>',
          'import "C"',
          '',
          'import "unsafe"',
          '',
          'var hooks = map[string]func(){}',
          '',
          free,
          '',
          'func Next() int { return 1 }',
          '',
          pay,
        ].join('\n'),
      }),
    });
    expect(
      functions.map(({ name, firstLine, lastLine, sourceHash }) => [
        name,
        firstLine,
        lastLine,
        sourceHash,
      ]),
    ).toEqual([
      ['Free', 10, 10, sha256(free)],
      ['Next', 12, 12, sha256('func Next() int { return 1 }')],
      ['Pay', 14, 14, sha256(pay)],
    ]);
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([
      { caller: 'pay/pay.go#Pay', line: 14, expression: 'hooks[k]', reason: 'dynamic-key' },
    ]);
  });

  it('pairs a call in a file that imports C whose text cgo rewrites, so the call and its open end enter the document', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          '// #include <stdlib.h>',
          'import "C"',
          '',
          'func Pay() { hookFor(C.int(1))() }',
          '',
          'func hookFor(cents C.int) func() { return nil }',
        ),
      }),
    });
    expect(calls).toEqual([{ caller: 'pay/pay.go#Pay', callee: 'pay/pay.go#hookFor', line: 6 }]);
    expect(openEnds).toEqual([
      {
        caller: 'pay/pay.go#Pay',
        line: 6,
        expression: 'hookFor(C.int(1))',
        reason: 'function-value',
      },
    ]);
  });

  const CGO_PREAMBLE = [
    'package pay',
    '',
    '/*',
    '#include <stdlib.h>',
    'static int take(void* p) { return 0; }',
    'static void drop(void* p) {}',
    '#define LIMIT 3',
    'enum { RED = 1 };',
    '*/',
    'import "C"',
    '',
    'import "unsafe"',
    '',
    'func getF(n C.int) func() { return nil }',
    '',
    'func hookFor(any) func() { return nil }',
    '',
    'type W struct{}',
    '',
    'func (W) Run() {}',
    '',
    'func wrap(n C.int) W { return W{} }',
    '',
    'func g() int { return 0 }',
    '',
  ];
  const cgoPayOf = (...body: readonly string[]): ReturnType<typeof extractGo> =>
    extractGo({ repo: repoOf({ 'pay/pay.go': lines(...CGO_PREAMBLE, ...body) }) });
  const LINE = CGO_PREAMBLE.length + 1;
  const callsAndOpenEndsOfPay = (
    document: ReturnType<typeof extractGo>,
  ): readonly (readonly [string, string, number])[] => [
    ...document.calls
      .filter(({ caller }) => caller === 'pay/pay.go#Pay')
      .map(({ callee, line }) => [callee, '', line] as const),
    ...document.openEnds.map(({ expression, reason, line }) => [expression, reason, line] as const),
  ];

  it('pairs a call whose argument is a C constant or a C size', () => {
    const document = cgoPayOf(
      'func Pay() {',
      '	getF(C.LIMIT)()',
      '	getF(C.RED)()',
      '	getF(C.int(C.sizeof_int))()',
      '}',
    );
    expect(callsAndOpenEndsOfPay(document)).toEqual([
      ['pay/pay.go#getF', '', LINE + 1],
      ['pay/pay.go#getF', '', LINE + 2],
      ['pay/pay.go#getF', '', LINE + 3],
      ['getF(C.LIMIT)', 'function-value', LINE + 1],
      ['getF(C.RED)', 'function-value', LINE + 2],
      ['getF(C.int(C.sizeof_int))', 'function-value', LINE + 3],
    ]);
  });

  it('pairs a call whose argument calls C.malloc', () => {
    const document = cgoPayOf('func Pay() {', '	hookFor(C.malloc(1))()', '}');
    expect(callsAndOpenEndsOfPay(document)).toEqual([
      ['pay/pay.go#hookFor', '', LINE + 1],
      ['hookFor(C.malloc(1))', 'function-value', LINE + 1],
    ]);
  });

  it('pairs a call whose argument passes a Go pointer to C, which cgo wraps in a check', () => {
    const document = cgoPayOf(
      'func Pay(p unsafe.Pointer, b []byte) {',
      '	getF(C.take(p))()',
      '	hookFor(C.take(unsafe.Pointer(&b[g()])))()',
      '}',
    );
    expect(callsAndOpenEndsOfPay(document)).toEqual([
      ['pay/pay.go#getF', '', LINE + 1],
      ['pay/pay.go#hookFor', '', LINE + 2],
      ['pay/pay.go#g', '', LINE + 2],
      ['getF(C.take(p))', 'function-value', LINE + 1],
      ['hookFor(C.take(unsafe.Pointer(&b[g()])))', 'function-value', LINE + 2],
    ]);
  });

  it('ties each call after a call into C on the same line', () => {
    const document = cgoPayOf(
      'func Pay(p unsafe.Pointer) {',
      '	wrap(C.LIMIT).Run()',
      '	wrap(C.take(p)).Run()',
      '	wrap(C.int(C.RED)).Run()',
      '	defer C.drop(p); g()',
      '}',
    );
    expect(callsAndOpenEndsOfPay(document)).toEqual([
      ['pay/pay.go#W.Run', '', LINE + 1],
      ['pay/pay.go#wrap', '', LINE + 1],
      ['pay/pay.go#W.Run', '', LINE + 2],
      ['pay/pay.go#wrap', '', LINE + 2],
      ['pay/pay.go#W.Run', '', LINE + 3],
      ['pay/pay.go#wrap', '', LINE + 3],
      ['pay/pay.go#g', '', LINE + 4],
    ]);
  });

  it('ties a call into a file that imports C in another module of the repo that a replace loads', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v0.0.0',
          '',
          'replace example.com/money => ./money',
        ),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': lines(
          'package money',
          '',
          '// #include <stdlib.h>',
          'import "C"',
          '',
          'func Format(cents int) string {',
          '	C.free(nil)',
          '	return digits(cents)',
          '}',
          '',
          'func digits(cents int) string { return "" }',
        ),
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 8 },
    ]);
    expect(openEnds).toEqual([]);
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

  it('makes a call of a map value with a key that is not a constant an open end with dynamic-key, not function-value', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          'var handlers = map[string]func(int){}',
          '',
          'func Pay(method string, cents int) {',
          '	handlers[method](cents)',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([
      {
        caller: 'pay/pay.go#Pay',
        line: 6,
        expression: 'handlers[method]',
        reason: 'dynamic-key',
      },
    ]);
  });

  it('makes a callee whose invalid type comes from code that does not load an open end with missing-module, through a type switch or an operator too, and a callee whose type a local type error lost untyped', () => {
    const { openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          'import "example.com/shop/gen"',
          '',
          'type Server struct{ client gen.Client }',
          '',
          'var handler = gen.Handler',
          '',
          'func Pay(server Server, charge gen.Charge, cents int) {',
          '	charge(cents)',
          '	gen.Lookup()(cents)',
          '	callback := gen.Callback',
          '	callback(cents)',
          '	handler(cents)',
          '	server.client(cents)',
          '	total := 1 + "cents"',
          '	total(cents)',
          '	switch v := any(cents).(type) {',
          '	case gen.T:',
          '		v.Do()',
          '	}',
          '	sum := gen.A + 1',
          '	sum(cents)',
          '}',
        ),
      }),
    });
    expect(openEnds.map(({ line, expression, reason }) => [line, expression, reason])).toEqual([
      [10, 'charge', 'missing-module'],
      [11, 'gen.Lookup()', 'missing-module'],
      [11, 'gen.Lookup', 'missing-module'],
      [13, 'callback', 'missing-module'],
      [14, 'handler', 'missing-module'],
      [15, 'server.client', 'missing-module'],
      [17, 'total', 'untyped'],
      [20, 'v.Do', 'missing-module'],
      [23, 'sum', 'missing-module'],
    ]);
  });

  it('makes a method call on a receiver whose type a local type error lost untyped, and on a receiver of code that does not load missing-module', () => {
    const { openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          'import "example.com/shop/gen"',
          '',
          'type Server struct{ client gen.Client }',
          '',
          'func Pay(server Server) {',
          '	total := 1 + "cents"',
          '	total.Round()',
          '	client := gen.New()',
          '	client.Send()',
          '	server.client.Send()',
          '}',
        ),
      }),
    });
    expect(openEnds.map(({ line, expression, reason }) => [line, expression, reason])).toEqual([
      [9, 'total.Round', 'untyped'],
      [10, 'gen.New', 'missing-module'],
      [11, 'client.Send', 'missing-module'],
      [12, 'server.client.Send', 'missing-module'],
    ]);
  });

  it('makes a call of a func value from a field, a variable, a parameter or a call result an open end with function-value, and a map value with a constant key other', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          'type Gateway struct{ charge func(int) }',
          '',
          'var handlers = map[string]func(int){}',
          '',
          'func Pay(gateway Gateway, done func(), next func() func(int), cents int) {',
          '	gateway.charge(cents)',
          '	done()',
          '	next()(cents)',
          '	refund := gateway.charge',
          '	refund(cents)',
          '	handlers["card"](cents)',
          '}',
          '',
          'func Retry[F ~func()](attempt F) {',
          '	attempt()',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([]);
    expect(openEnds.map(({ line, expression, reason }) => [line, expression, reason])).toEqual([
      [8, 'gateway.charge', 'function-value'],
      [9, 'done', 'function-value'],
      [10, 'next()', 'function-value'],
      [10, 'next', 'function-value'],
      [12, 'refund', 'function-value'],
      [13, 'handlers["card"]', 'other'],
      [17, 'attempt', 'function-value'],
    ]);
  });

  it('makes a call that no rule ties and no other reason fits an open end with other', () => {
    const { openEnds } = extractGo({
      repo: repoOf({
        'pay/pay.go': lines(
          'package pay',
          '',
          'func Retry(attempts []func()) {',
          '	attempts[0]()',
          '}',
        ),
      }),
    });
    expect(openEnds).toEqual([
      { caller: 'pay/pay.go#Retry', line: 4, expression: 'attempts[0]', reason: 'other' },
    ]);
  });

  it('makes a call into a generated mock that is missing from a package that loads an open end with missing-module', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'store/store.go': lines(
          'package store',
          '',
          '//go:generate mockgen -source=store.go -destination=store_mock.go -package=store',
          '',
          'type Store interface{ Save(cents int) }',
          '',
          'func Keep(store Store, cents int) { store.Save(cents) }',
        ),
        'store/store_test.go': lines(
          'package store',
          '',
          'func TestKeep() {',
          '	Keep(NewMockStore(), 1)',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([
      { caller: 'store/store_test.go#TestKeep', callee: 'store/store.go#Keep', line: 4 },
    ]);
    expect(openEnds).toContainEqual({
      caller: 'store/store_test.go#TestKeep',
      line: 4,
      expression: 'NewMockStore',
      reason: 'missing-module',
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

  it('ties a call into another module of the repo that a replace loads from the repo', () => {
    const { files, calls, openEnds } = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v0.0.0',
          '',
          'replace example.com/money => ./money',
        ),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(files).toEqual(['checkout/checkout.go', 'money/money.go']);
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('ties a call into another module of the repo that a replace loads from the repo, even with -trimpath in GOFLAGS', () => {
    vi.stubEnv('GOFLAGS', '-trimpath');
    const { calls } = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v0.0.0',
          '',
          'replace example.com/money => ./money',
        ),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(calls).toContainEqual({
      caller: 'checkout/checkout.go#Total',
      callee: 'money/money.go#Format',
      line: 6,
    });
  });

  it('drops -mod and -trimpath from the GOFLAGS of the go env file too, in the build of the extractor and in the load of the repo', () => {
    const goEnvFile = join(tempDir('callmap-go-env-'), 'env');
    writeFileSync(goEnvFile, lines('GOFLAGS=-mod=mod -trimpath'));
    vi.stubEnv('GOENV', goEnvFile);
    vi.stubEnv('GOFLAGS', undefined);
    vi.stubEnv('GOMODCACHE', tempDir('callmap-go-cache-'));
    removeGoExtractorBinary();
    const buildSettings = execFileSync('go', ['version', '-m', goExtractorBinary()], {
      encoding: 'utf8',
    });
    expect(buildSettings).not.toMatch(/-trimpath=true/);
    const goMod = lines(
      'module example.com/shop',
      '',
      'go 1.22',
      '',
      'replace example.com/money => ./money',
    );
    const repo = repoOf({
      'go.mod': goMod,
      'money/go.mod': MONEY_GO_MOD,
      'money/money.go': MONEY,
      'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
    });
    extractGo({ repo });
    expect(readFileSync(join(repo, 'go.mod'), 'utf8')).toBe(goMod);
    expect(existsSync(join(repo, 'go.sum'))).toBe(false);
    const { calls } = extractGo({
      repo: repoOf({
        'go.mod': lines(goMod, 'require example.com/money v0.0.0'),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(calls).toContainEqual({
      caller: 'checkout/checkout.go#Total',
      callee: 'money/money.go#Format',
      line: 6,
    });
  });

  it('makes a call into another module of the repo a library call when the go tool loads it from the module cache', () => {
    const money = {
      'go.mod': MONEY_GO_MOD,
      'money.go': MONEY,
    };
    const cache = moduleCacheOf('example.com/money', 'v1.0.0', money);
    vi.stubEnv('GOMODCACHE', cache.dir);
    const { files, functions, calls, openEnds } = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v1.0.0',
        ),
        'go.sum': cache.goSum,
        'money/go.mod': money['go.mod'],
        'money/money.go': money['money.go'],
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(files).toEqual(['checkout/checkout.go', 'money/money.go']);
    expect(functions.map(({ id }) => id)).toContain('money/money.go#Format');
    expect(calls).toEqual([
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('makes a call into a module that is not in the module cache an open end with missing-module, and still emits the document', () => {
    vi.stubEnv('GOMODCACHE', tempDir('callmap-go-cache-'));
    const document = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v1.0.0',
        ),
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(readGraphDocument(document)).toEqual(document);
    expect(document.functions.map(({ id }) => id)).toEqual(['checkout/checkout.go#Total']);
    expect(document.openEnds).toEqual([
      {
        caller: 'checkout/checkout.go#Total',
        line: 6,
        expression: 'money.Format',
        reason: 'missing-module',
      },
    ]);
  });

  it('loads the modules of a go.work once, as one workspace, and emits each file once', () => {
    const { files, functions, calls, openEnds } = extractGo({
      repo: repoOf({
        'go.work': lines('go 1.22', '', 'use (', '\t.', '\t./money', ')'),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'money/money_test.go': lines('package money', '', 'func TestDigits() { digits(1) }'),
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
      }),
    });
    expect(files).toEqual(['checkout/checkout.go', 'money/money.go', 'money/money_test.go']);
    expect(functions.map(({ id }) => id)).toEqual([
      'checkout/checkout.go#Total',
      'money/money.go#Format',
      'money/money.go#digits',
      'money/money_test.go#TestDigits',
    ]);
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
      { caller: 'money/money_test.go#TestDigits', callee: 'money/money.go#digits', line: 3 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('loads a module that the go.work does not use on its own, next to the workspace', () => {
    const { files, calls } = extractGo({
      repo: repoOf({
        'go.work': lines('go 1.22', '', 'use (', '\t.', '\t./money', ')'),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'checkout/checkout.go': CHECKOUT_OF_MONEY_MODULE,
        'tools/go.mod': lines('module example.com/tools', '', 'go 1.22'),
        'tools/lint.go': lines(
          'package tools',
          '',
          'func Lint() { check() }',
          '',
          'func check() {}',
        ),
      }),
    });
    expect(files).toEqual(['checkout/checkout.go', 'money/money.go', 'tools/lint.go']);
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Format', line: 6 },
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
      { caller: 'tools/lint.go#Lint', callee: 'tools/lint.go#check', line: 3 },
    ]);
  });

  it('reads the other modules when the go tool refuses one, and leaves out the files of the refused module', () => {
    const { files, calls } = extractGo({
      repo: repoOf({
        'money/money.go': MONEY,
        'tools/go.mod': lines('module example.com/tools', '', 'go 1.99'),
        'tools/lint.go': lines('package tools', '', 'func Lint() {}'),
      }),
    });
    expect(files).toEqual(['money/money.go']);
    expect(calls).toEqual([
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
    ]);
  });

  it('reads each module on its own when the go tool refuses the go.work, and leaves out the files of the refused module', () => {
    const { files, calls } = extractGo({
      repo: repoOf({
        'go.work': lines('go 1.99', '', 'use (', '\t.', '\t./money', '\t./tools', ')'),
        'money/go.mod': MONEY_GO_MOD,
        'money/money.go': MONEY,
        'tools/go.mod': lines('module example.com/tools', '', 'go 1.99'),
        'tools/lint.go': lines('package tools', '', 'func Lint() {}'),
        'checkout/checkout.go': CHECKOUT,
      }),
    });
    expect(files).toEqual(['checkout/checkout.go', 'money/money.go']);
    expect(calls).toEqual([
      { caller: 'money/money.go#Format', callee: 'money/money.go#digits', line: 5 },
    ]);
  });

  it('reads a vendored module from vendor/, with no module cache and no network', () => {
    vi.stubEnv('GOMODCACHE', tempDir('callmap-go-cache-'));
    const { files, calls, openEnds } = extractGo({
      repo: repoOf({
        'go.mod': lines(
          'module example.com/shop',
          '',
          'go 1.22',
          '',
          'require example.com/money v1.0.0',
        ),
        'vendor/modules.txt': lines(
          '# example.com/money v1.0.0',
          '## explicit; go 1.22',
          'example.com/money',
        ),
        'vendor/example.com/money/money.go': MONEY,
        'checkout/checkout.go': lines(
          'package checkout',
          '',
          'import "example.com/money"',
          '',
          'func Total(cents int) string {',
          '\treturn money.Format(round(cents))',
          '}',
          '',
          'func round(cents int) int { return cents }',
        ),
      }),
    });
    expect(files).toEqual(['checkout/checkout.go']);
    expect(calls).toEqual([
      { caller: 'checkout/checkout.go#Total', callee: 'checkout/checkout.go#round', line: 6 },
    ]);
    expect(openEnds).toEqual([]);
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

  it('matches a method by the types of its parameters and results, not by their names', () => {
    const { calls } = extractGo({
      repo: repoOf({
        'words/words.go': lines(
          'package words',
          '',
          'type Translator interface {',
          '\tTr(key string, args ...any) string',
          '\tEach(visit func(key string) bool)',
          '}',
          '',
          'type Locale struct{}',
          '',
          'func (l Locale) Tr(s string, values ...any) (text string) { return s }',
          '',
          'func (l Locale) Each(walk func(k string) bool) {}',
          '',
          'func Title(words Translator) string { return words.Tr("title") }',
        ),
      }),
    });
    expect(calls).toEqual([
      {
        caller: 'words/words.go#Title',
        callee: 'words/words.go#Locale.Tr',
        line: 14,
        group: 'words/words.go:14:52',
      },
    ]);
  });

  it('decides a call by the interface of the receiver, so a method of a library interface that a repo interface embeds is a one-of group', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'files/files.go': lines(
          'package files',
          '',
          'import "io"',
          '',
          'type ReadDone interface {',
          '\tio.Reader',
          '\tDone()',
          '}',
          '',
          'type Upload struct{}',
          '',
          'func (u *Upload) Read(buffer []byte) (int, error) { return 0, nil }',
          '',
          'func (u *Upload) Done() {}',
          '',
          'type Plain struct{}',
          '',
          'func (p Plain) Read(buffer []byte) (int, error) { return 0, nil }',
          '',
          'func Drain(source ReadDone) {',
          '\tsource.Read(nil)',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([
      {
        caller: 'files/files.go#Drain',
        callee: 'files/files.go#Upload.Read',
        line: 21,
        group: 'files/files.go:21:9',
      },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('makes a call through an interface of the repo that only a library type implements a library call', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'text/text.go': lines(
          'package text',
          '',
          'import "strings"',
          '',
          'type Source interface{ ReadRune() (r rune, size int, err error) }',
          '',
          'func Open(text string) Source { return strings.NewReader(text) }',
          '',
          'func First(source Source) { source.ReadRune() }',
        ),
      }),
    });
    expect(calls).toEqual([]);
    expect(openEnds).toEqual([]);
  });

  it('makes a call a library call when the type in scope that implements the interface takes the method from a library type that it embeds', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'text/text.go': lines(
          'package text',
          '',
          'import "strings"',
          '',
          'type Text interface {',
          '\tGrow(n int)',
          '\tTitle() string',
          '}',
          '',
          'type Page struct{ strings.Builder }',
          '',
          'func (p *Page) Title() string { return "" }',
          '',
          'func Write(text Text) {',
          '\ttext.Grow(1)',
          '\ttext.Title()',
          '}',
        ),
      }),
    });
    expect(calls).toEqual([
      {
        caller: 'text/text.go#Write',
        callee: 'text/text.go#Page.Title',
        line: 16,
        group: 'text/text.go:16:7',
      },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('holds in a one-of group only the methods that a file in scope declares, and leaves out a type whose method comes from a library type that it embeds', () => {
    const { calls, openEnds } = extractGo({
      repo: repoOf({
        'text/text.go': lines(
          'package text',
          '',
          'import "strings"',
          '',
          'type Writer interface{ WriteString(s string) (int, error) }',
          '',
          'type buf struct{ *strings.Builder }',
          '',
          'type Log struct{}',
          '',
          'func (Log) WriteString(s string) (int, error) { return 0, nil }',
          '',
          'func Write(writer Writer) { writer.WriteString("") }',
          '',
          'func Use() { Write(buf{}) }',
        ),
      }),
    });
    expect(calls).toEqual([
      {
        caller: 'text/text.go#Write',
        callee: 'text/text.go#Log.WriteString',
        line: 13,
        group: 'text/text.go:13:36',
      },
      { caller: 'text/text.go#Use', callee: 'text/text.go#Write', line: 15 },
    ]);
    expect(openEnds).toEqual([]);
  });

  it('keeps no-implementation when the only implementation takes the method from an interface that it embeds', () => {
    const { openEnds } = extractGo({
      repo: repoOf({
        'store/store.go': lines(
          'package store',
          '',
          'type Saver interface{ Save() }',
          '',
          'type Logged struct{ Saver }',
          '',
          'func Keep(saver Saver) { saver.Save() }',
        ),
      }),
    });
    expect(openEnds).toEqual([
      {
        caller: 'store/store.go#Keep',
        line: 7,
        expression: 'saver.Save',
        reason: 'no-implementation',
      },
    ]);
  });

  it('holds a generic type in a group when one type argument for each of its type parameters makes its methods implement the interface', () => {
    const { calls } = extractGo({
      repo: repoOf({
        'box/box.go': lines(
          'package box',
          '',
          'type Store interface {',
          '\tPut(item int)',
          '\tGet() int',
          '}',
          '',
          'type Box[T any] struct{ item T }',
          '',
          'func (b *Box[T]) Put(item T) { b.item = item }',
          '',
          'func (b *Box[T]) Get() T { return b.item }',
          '',
          'type Label[T any] struct{}',
          '',
          'func (l Label[T]) Put(item T) {}',
          '',
          'func (l Label[T]) Get() string { return "" }',
          '',
          'func Keep(store Store) { store.Put(store.Get()) }',
        ),
      }),
    });
    expect(calls.map(({ callee, group }) => `${group} ${callee}`)).toEqual([
      'box/box.go:20:32 box/box.go#Box.Put',
      'box/box.go:20:42 box/box.go#Box.Get',
    ]);
  });
});
