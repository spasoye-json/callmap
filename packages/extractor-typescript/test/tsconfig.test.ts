import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExtractionError, extractGraphDocument } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
const INNER = `${FIXTURE}/src`;

const repoWith = (files: Readonly<Record<string, string>>): string => {
  const repo = tempDir('callmap-ts-config-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

const PRICE = 'export const price = () => 1;\n';

const checkoutCalls = {
  caller: 'src/screens/checkout.tsx#Checkout',
  callee: 'src/shared/money.ts#formatMoney',
  line: 8,
};

describe('the tsconfig a call is resolved through', () => {
  it('resolves a call through an alias that a tsconfig inherits from the one it extends', () => {
    expect(extractGraphDocument({ repo: FIXTURE }).calls).toContainEqual(checkoutCalls);
  });

  it('resolves a relative import in a repo that has no tsconfig at its root', () => {
    expect(extractGraphDocument({ repo: INNER }).calls).toContainEqual({
      caller: 'api/receipt.ts#printReceipt',
      callee: 'shared/money.ts#formatMoney',
      line: 4,
    });
  });

  it('resolves no alias in a repo that has no tsconfig, because that is where aliases live', () => {
    expect(
      extractGraphDocument({ repo: INNER }).calls.some(
        ({ caller }) => caller === 'screens/checkout.tsx#Checkout',
      ),
    ).toBe(false);
  });

  it('resolves the alias again when told which tsconfig to read', () => {
    const document = extractGraphDocument({ repo: INNER, tsconfig: `${FIXTURE}/tsconfig.json` });
    expect(document.calls).toContainEqual({
      caller: 'screens/checkout.tsx#Checkout',
      callee: 'shared/money.ts#formatMoney',
      line: 8,
    });
  });

  it('refuses a tsconfig it was told to read and could not, and names it', () => {
    const read = () => extractGraphDocument({ repo: FIXTURE, tsconfig: `${FIXTURE}/nowhere.json` });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/nowhere\.json/);
  });

  it('refuses a root tsconfig that is there and cannot be read, and names it', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "compilerOptions": { "paths": ',
      'index.ts': PRICE,
    });
    const read = () => extractGraphDocument({ repo });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/tsconfig\.json/);
  });

  it('refuses a tsconfig whose extends chain does not resolve, and names the base', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "extends": "./tsconfig.base.json" }\n',
      'index.ts': PRICE,
    });
    const read = () => extractGraphDocument({ repo });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/tsconfig\.base\.json/);
  });

  it('reads a tsconfig whose include names no file, because the extractor brings its own', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "include": ["nowhere/**/*.ts"] }\n',
      'index.ts': PRICE,
    });
    expect(extractGraphDocument({ repo }).files).toEqual(['index.ts']);
  });
});

describe('the directories every extractor skips', () => {
  it('leaves out node_modules, vendor, and a dot directory', () => {
    const repo = repoWith({
      'src/a.ts': PRICE,
      'vendor/lib.ts': PRICE,
      'node_modules/x/index.ts': PRICE,
      '.cache/b.ts': PRICE,
    });
    expect(extractGraphDocument({ repo }).files).toEqual(['src/a.ts']);
  });
});

describe('a monorepo whose packages import each other by name', () => {
  const REPO = fileURLToPath(new URL('../../..', import.meta.url));
  const document = () =>
    extractGraphDocument({
      repo: REPO,
      scope: ['packages/extractor-go/src/**', 'packages/reference-graph/**'],
    });

  it('ties a call through a package name to the function the package exports', () => {
    expect(document().calls).toContainEqual({
      caller: 'packages/extractor-go/src/launch.ts#extractGo',
      callee: 'packages/reference-graph/src/document.ts#readReferenceGraphDocument',
      line: 81,
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
