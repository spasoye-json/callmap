import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReferenceGraphDocument, referenceGraphFromDocuments } from '@archmap/reference-graph';
import { ExtractionError, extractTypeScript } from '../src/index.ts';

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

describe('the directories every extractor skips', () => {
  it('leaves out node_modules, vendor, and a dot directory', () => {
    const repo = mkdtempSync(join(tmpdir(), 'archmap-ts-skipped-'));
    for (const file of ['src/a.ts', 'vendor/lib.ts', 'node_modules/x/index.ts', '.cache/b.ts']) {
      mkdirSync(join(repo, file, '..'), { recursive: true });
      writeFileSync(join(repo, file), 'export const x = 1;\n');
    }
    expect(extractTypeScript({ repo, scope: [] }).files).toEqual(['src/a.ts']);
  });
});

describe('the tsconfig an alias is resolved through', () => {
  /** The same fixture read one directory down, where no `tsconfig.json` sits. */
  const INNER = `${FIXTURE}/src`;

  /**
   * A repo whose root `tsconfig.json` is there and is not a config. It is written into a temp
   * directory rather than committed, because a file that is not valid JSON is not a file this repo
   * can hold alongside the ones its own tools read.
   */
  let broken: string | undefined;
  const brokenRepo = () => {
    if (broken !== undefined) return broken;
    broken = mkdtempSync(join(tmpdir(), 'archmap-broken-tsconfig-'));
    writeFileSync(join(broken, 'tsconfig.json'), '{ "compilerOptions": { "paths": ');
    writeFileSync(join(broken, 'index.ts'), 'export const price = 1;\n');
    return broken;
  };

  /**
   * A repo whose root `tsconfig.json` is JSON the compiler reads and extends a base that is not
   * there. Only parsing the config reports that; the options it hands back simply hold none of the
   * aliases the base held, which is the alias-free document the extractor exists to refuse.
   */
  let dangling: string | undefined;
  const danglingRepo = () => {
    if (dangling !== undefined) return dangling;
    dangling = mkdtempSync(join(tmpdir(), 'archmap-dangling-extends-'));
    writeFileSync(join(dangling, 'tsconfig.json'), '{ "extends": "./tsconfig.base.json" }\n');
    writeFileSync(join(dangling, 'index.ts'), 'export const price = 1;\n');
    return dangling;
  };

  /**
   * A repo whose root `tsconfig.json` is sound and whose `include` names no file that is there. The
   * extractor brings its own file list, so what the config would have compiled is not its business.
   */
  let inputless: string | undefined;
  const inputlessRepo = () => {
    if (inputless !== undefined) return inputless;
    inputless = mkdtempSync(join(tmpdir(), 'archmap-inputless-tsconfig-'));
    writeFileSync(join(inputless, 'tsconfig.json'), '{ "include": ["nowhere/**/*.ts"] }\n');
    writeFileSync(join(inputless, 'index.ts'), 'export const price = 1;\n');
    return inputless;
  };

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

  it('resolves an alias a tsconfig inherits from the one it extends', () => {
    expect(extract(...source).edges).toContainEqual({ from: SCREEN, to: SHARED });
  });

  it('refuses a tsconfig it was told to read and could not, rather than dropping every alias', () => {
    expect(() => extractTypeScript({ repo: FIXTURE, tsconfig: `${FIXTURE}/nowhere.json` })).toThrow(
      ExtractionError,
    );
  });

  it('names the tsconfig it could not read', () => {
    expect(() => extractTypeScript({ repo: FIXTURE, tsconfig: `${FIXTURE}/nowhere.json` })).toThrow(
      /nowhere.json/,
    );
  });

  it('refuses a root tsconfig that is there and cannot be read, rather than dropping every alias', () => {
    expect(() => extractTypeScript({ repo: brokenRepo() })).toThrow(ExtractionError);
  });

  it('names the root tsconfig it could not read', () => {
    expect(() => extractTypeScript({ repo: brokenRepo() })).toThrow(/tsconfig\.json/);
  });

  it('refuses a tsconfig whose extends chain does not resolve, rather than dropping every alias', () => {
    expect(() => extractTypeScript({ repo: danglingRepo() })).toThrow(ExtractionError);
  });

  it('names the base config the extends chain could not reach', () => {
    expect(() => extractTypeScript({ repo: danglingRepo() })).toThrow(/tsconfig\.base\.json/);
  });

  it('reads a tsconfig whose include names no file, because the extractor brings its own', () => {
    expect(extractTypeScript({ repo: inputlessRepo() }).files).toEqual(['index.ts']);
  });

  it('resolves the alias again when told which tsconfig to read', () => {
    const document = extractTypeScript({ repo: INNER, tsconfig: `${FIXTURE}/tsconfig.json` });
    expect(document.edges).toContainEqual({
      from: 'screens/checkout.tsx',
      to: 'api/orders-client.ts',
    });
  });
});

/**
 * A repo whose own packages import each other by package name, which is what a monorepo is and
 * what the scope globs of ADR-0009 exist for. The repo this extractor lives in is one, and its
 * links are real, so it is the fixture for that rule rather than a second tree of stubs.
 */
describe('a monorepo whose packages import each other by name', () => {
  const REPO = fileURLToPath(new URL('../../..', import.meta.url));

  const document = () =>
    extractTypeScript({
      repo: REPO,
      scope: ['packages/extractor-go/src/**', 'packages/reference-graph/**'],
    });

  it('resolves a package name to the file the package points at', () => {
    expect(document().edges).toContainEqual({
      from: 'packages/extractor-go/src/launch.ts',
      to: 'packages/reference-graph/src/index.ts',
    });
  });

  it('claims no file outside the scope, so nothing from a linked package leaks in', () => {
    expect(
      document().files.every(
        (path) =>
          path.startsWith('packages/extractor-go/src/') ||
          path.startsWith('packages/reference-graph/'),
      ),
    ).toBe(true);
  });
});
