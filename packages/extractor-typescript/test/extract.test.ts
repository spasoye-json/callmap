import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@archmap/reference-graph';
import { extractTypeScript } from '../src/index.ts';

/** The tiny TypeScript repo this package commits, read the way an extractor reads a repo. */
const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const SCREEN = 'src/screens/checkout.tsx';
const CLIENT = 'src/api/orders-client.ts';
const RECEIPT = 'src/api/receipt.ts';
const SHARED = 'src/shared/index.ts';
const MONEY = 'src/shared/money.ts';
const TOTALS = 'src/legacy/totals.js';
const ROUND = 'src/legacy/round.js';
const LONELY = 'src/lonely.ts';
const BUILD = 'tools/build.ts';

const extract = (...scope: readonly string[]) => extractTypeScript({ repo: FIXTURE, scope });

const source = ['src/**'];

describe('extractTypeScript', () => {
  it('stamps the language tag of the extractor on the document', () => {
    expect(extract(...source).language).toBe('typescript');
  });

  it('records the scope the document was built under', () => {
    expect(extract(...source).scope).toEqual(source);
  });

  it('claims every file in scope', () => {
    expect(extract(...source).files).toEqual([
      CLIENT,
      RECEIPT,
      ROUND,
      TOTALS,
      LONELY,
      SCREEN,
      SHARED,
      MONEY,
    ]);
  });

  it('claims a file nothing references and that references nothing', () => {
    expect(extract(...source).files).toContain(LONELY);
  });

  it('emits a document the core validates', () => {
    const document = extract(...source);
    expect(readReferenceGraphDocument(document)).toEqual(document);
  });

  it('emits a document the core indexes into a reference graph', () => {
    const graph = referenceGraphFromDocuments(extract(...source));
    expect(graph.references(SCREEN, CLIENT)).toBe(true);
    expect(graph.languageOf(TOTALS)).toBe('typescript');
  });
});

describe('the reference edges the extractor resolves', () => {
  const edges = () => extract(...source).edges;
  const references = (from: string, to: string) =>
    edges().some((edge) => edge.from === from && edge.to === to);

  it('follows a relative import', () => {
    expect(references(RECEIPT, MONEY)).toBe(true);
  });

  it('follows a tsconfig path alias', () => {
    expect(references(SCREEN, CLIENT)).toBe(true);
  });

  it('follows a tsconfig path alias that names one file and no star', () => {
    expect(references(SCREEN, SHARED)).toBe(true);
  });

  it('follows a type-only import, which is a static reference like any other', () => {
    expect(references(CLIENT, MONEY)).toBe(true);
  });

  it('follows a re-export', () => {
    expect(references(SHARED, MONEY)).toBe(true);
  });

  it('follows a dynamic import', () => {
    expect(references(CLIENT, RECEIPT)).toBe(true);
  });

  it('follows a JavaScript file, because JavaScript rides with TypeScript (ADR-0009)', () => {
    expect(references(MONEY, TOTALS)).toBe(true);
  });

  it('follows a require call in a JavaScript file', () => {
    expect(references(TOTALS, ROUND)).toBe(true);
  });

  it('leaves out an import no resolution finds, such as a package nothing installed', () => {
    expect(edges().every((edge) => !edge.to.includes('react'))).toBe(true);
  });

  it('emits one edge for a file imported twice, once for a value and once for a type', () => {
    expect(edges().filter((edge) => edge.from === RECEIPT && edge.to === MONEY)).toHaveLength(1);
  });

  it('holds files and edges in a stable order, so a document is the same twice running', () => {
    expect(extract(...source)).toEqual(extract(...source));
  });
});

describe('the scope a document is built under', () => {
  it('leaves out a file no scope glob matches', () => {
    expect(extract(...source).files).not.toContain(BUILD);
  });

  it('leaves out an edge from a file no scope glob matches', () => {
    expect(extract(...source).edges.every((edge) => edge.from !== BUILD)).toBe(true);
  });

  it('takes the whole repo when no glob narrows it', () => {
    expect(extract().files).toContain(BUILD);
  });

  it('resolves an edge out of a file that only a wider scope takes in', () => {
    expect(extract().edges).toContainEqual({ from: BUILD, to: MONEY });
  });

  it('leaves out an edge whose far end no glob takes in, so no edge dangles', () => {
    const document = extract('tools/**');
    expect(document.files).toEqual([BUILD]);
    expect(document.edges).toEqual([]);
  });

  it('takes two subtrees when two globs name them', () => {
    const document = extract('src/legacy/**', 'tools/**');
    expect(document.files).toEqual([ROUND, TOTALS, BUILD]);
    expect(document.edges).toEqual([{ from: TOTALS, to: ROUND }]);
  });
});

describe('the tsconfig an alias is resolved through', () => {
  /** The same fixture read one directory down, where no `tsconfig.json` sits. */
  const INNER = `${FIXTURE}/src`;

  it('resolves a relative import in a repo that has no tsconfig at its root', () => {
    const document = extractTypeScript({ repo: INNER });
    expect(document.edges).toContainEqual({ from: 'api/receipt.ts', to: 'shared/money.ts' });
  });

  it('resolves no alias in a repo that has no tsconfig, because that is where aliases live', () => {
    const document = extractTypeScript({ repo: INNER });
    expect(document.edges).not.toContainEqual({
      from: 'screens/checkout.tsx',
      to: 'api/orders-client.ts',
    });
  });

  it('resolves the alias again when told which tsconfig to read', () => {
    const document = extractTypeScript({ repo: INNER, tsconfig: `${FIXTURE}/tsconfig.json` });
    expect(document.edges).toContainEqual({
      from: 'screens/checkout.tsx',
      to: 'api/orders-client.ts',
    });
  });
});
