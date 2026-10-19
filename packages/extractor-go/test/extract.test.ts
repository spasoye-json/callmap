import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@callmap/reference-graph';
import { extractGo, GoExtractionError } from '../src/index.ts';

/** The tiny Go repo this package commits, read the way an extractor reads a repo. */
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const MAIN = 'cmd/shop/main.go';
const ORDERS = 'internal/orders/orders.go';
const RECEIPT = 'internal/orders/receipt.go';
const ORDERS_TEST = 'internal/orders/orders_test.go';
const MONEY = 'internal/money/money.go';
const LONELY = 'internal/lonely/lonely.go';
const INVOICE = 'billing/invoice/invoice.go';
const GEN = 'tools/gen/gen.go';

const extract = (...scope: readonly string[]) => extractGo({ repo: FIXTURE, scope });

const source = ['cmd/**', 'internal/**'];

/** A throwaway repo written from a map of repo-relative path to file text. */
const repoOf = (files: Readonly<Record<string, string>>): string => {
  const repo = mkdtempSync(join(tmpdir(), 'callmap-go-repo-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

describe('extractGo', () => {
  it('stamps the language tag of the extractor on the document', () => {
    expect(extract().language).toBe('go');
  });

  it('claims every Go file of the repo, in path order', () => {
    expect(extract().files).toEqual([
      INVOICE,
      MAIN,
      LONELY,
      MONEY,
      ORDERS,
      ORDERS_TEST,
      RECEIPT,
      GEN,
    ]);
  });

  it('claims a file nothing references and that references nothing', () => {
    expect(extract().files).toContain(LONELY);
  });

  it('leaves out vendored modules and testdata, which the go tool never builds as the repo', () => {
    const { files } = extract();
    expect(files.filter((path) => path.startsWith('vendor/'))).toEqual([]);
    expect(files.filter((path) => path.includes('/testdata/'))).toEqual([]);
  });

  it('emits exactly the edges the imports name, each package expanded to its files', () => {
    expect(extract().edges).toEqual([
      { from: MAIN, to: INVOICE },
      { from: MAIN, to: ORDERS },
      { from: MAIN, to: RECEIPT },
      { from: ORDERS, to: MONEY },
      { from: ORDERS_TEST, to: MONEY },
      { from: GEN, to: MONEY },
    ]);
  });

  it('expands an import of a package into an edge to every file of that package', () => {
    const { edges } = extract();
    expect(edges).toContainEqual({ from: MAIN, to: ORDERS });
    expect(edges).toContainEqual({ from: MAIN, to: RECEIPT });
  });

  it('lets a test file reference its package but never be referenced, as Go never imports one', () => {
    const { edges } = extract();
    expect(edges).toContainEqual({ from: ORDERS_TEST, to: MONEY });
    expect(edges.filter(({ to }) => to === ORDERS_TEST)).toEqual([]);
  });

  it('resolves an import into another module of the same repo', () => {
    expect(extract().edges).toContainEqual({ from: MAIN, to: INVOICE });
  });

  it('does not resolve an outer import path into a directory a nested go.mod owns', () => {
    const repo = repoOf({
      'go.mod': 'module example.com/shop\n\ngo 1.22\n',
      'billing/go.mod': 'module example.com/billing\n\ngo 1.22\n',
      'billing/invoice/invoice.go': 'package invoice\n',
      'cmd/shop/main.go': 'package main\n\nimport _ "example.com/shop/billing/invoice"\n',
    });
    expect(extractGo({ repo }).edges).toEqual([]);
  });

  it('resolves an import through the nested module whose path extends the outer one', () => {
    const repo = repoOf({
      'go.mod': 'module example.com/shop\n\ngo 1.22\n',
      'services/billing/go.mod': 'module example.com/shop/services/billing\n\ngo 1.22\n',
      'services/billing/invoice/invoice.go': 'package invoice\n',
      'cmd/shop/main.go': 'package main\n\nimport _ "example.com/shop/services/billing/invoice"\n',
    });
    expect(extractGo({ repo }).edges).toEqual([
      { from: 'cmd/shop/main.go', to: 'services/billing/invoice/invoice.go' },
    ]);
  });

  it('reads a module path that go.mod quotes', () => {
    const repo = repoOf({
      'go.mod': 'module "example.com/shop" // the shop\n',
      'money/money.go': 'package money\n',
      'main.go': 'package main\n\nimport _ "example.com/shop/money"\n',
    });
    expect(extractGo({ repo }).edges).toEqual([{ from: 'main.go', to: 'money/money.go' }]);
  });

  it('still reads the imports of a file whose body does not compile', () => {
    const repo = repoOf({
      'go.mod': 'module example.com/shop\n',
      'money/money.go': 'package money\n',
      'main.go': 'package main\n\nimport _ "example.com/shop/money"\n\nfunc main() {{{\n',
    });
    expect(extractGo({ repo }).edges).toEqual([{ from: 'main.go', to: 'money/money.go' }]);
  });

  it('records the scope the document was built under', () => {
    expect(extract(...source).scope).toEqual(source);
  });

  it('narrows the files to the scope it was given', () => {
    expect(extract(...source).files).toEqual([MAIN, LONELY, MONEY, ORDERS, ORDERS_TEST, RECEIPT]);
  });

  it('drops an edge whose far end the scope leaves out, rather than naming a file it does not claim', () => {
    expect(extract(...source).edges).not.toContainEqual({ from: MAIN, to: INVOICE });
  });

  it('emits a document the core validates', () => {
    const document = extract(...source);
    expect(readReferenceGraphDocument(document)).toEqual(document);
  });

  it('emits a document the core indexes into a reference graph', () => {
    const graph = referenceGraphFromDocuments(extract());
    expect(graph.references(MAIN, ORDERS)).toBe(true);
    expect(graph.languageOf(MONEY)).toBe('go');
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    expect(() => extractGo({ repo: `${FIXTURE}/nowhere` })).toThrow(GoExtractionError);
  });
});
