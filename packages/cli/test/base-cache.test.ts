import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { GraphDocument } from '@callmap/graph-document';
import { throughBaseCache } from '../src/base-cache.ts';
import type { CachedExtractor } from '../src/base-cache.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import { pageDataOf, runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const CART = 'src/cart.ts';

const BRANCH_CHANGES = {
  [`${CART}#legacyTotal`]: 'removed',
  [`${CART}#receipt`]: 'changed',
  [`${CART}#taxed`]: 'added',
};

const BASE_WITH_NO_CHECKER = {
  language: 'typescript',
  scope: [],
  files: [],
  functions: [],
  calls: [],
  openEnds: [],
};

const EMPTY_BASE = JSON.stringify({
  language: 'typescript',
  checker: { name: 'TypeScript', version: '6.0.3' },
  scope: [],
  files: [],
  functions: [],
  calls: [],
  openEnds: [],
});

const newCacheHome = (): string => tempDir('callmap-cache-');

const reviewHtml = (cacheHome: string, repo: string, ...flags: readonly string[]): string => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(
    ['review', repo, '--no-open', '--out', out, ...flags],
    undefined,
    cacheHome,
  );
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

const marksOf = (html: string) =>
  Object.fromEntries(pageDataOf(html).review.functions.map(({ id, mark }) => [id, mark]));

const entriesOf = (cacheHome: string): readonly string[] => {
  try {
    return readdirSync(join(cacheHome, 'callmap'), { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => join(cacheHome, 'callmap', entry));
  } catch {
    return [];
  }
};

const emptyEveryBase = (cacheHome: string): void => {
  for (const entry of entriesOf(cacheHome)) writeFileSync(entry, EMPTY_BASE);
};

describe('the base cache of a review', () => {
  it('reads the base of a second review from the cache, and writes the same page', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    const first = reviewHtml(cacheHome, repo);
    expect(entriesOf(cacheHome)).toHaveLength(1);
    expect(reviewHtml(cacheHome, repo)).toBe(first);

    emptyEveryBase(cacheHome);
    expect(Object.values(marksOf(reviewHtml(cacheHome, repo)))).not.toContain('removed');
  }, 60_000);

  it.each([
    ['the scope', ['--scope', 'src/**']],
    ['the tsconfig', ['--tsconfig', 'tsconfig.json']],
  ])(
    'reads the base again after a change of %s',
    (_, flags) => {
      const repo = featureBranchRepo();
      const cacheHome = newCacheHome();
      reviewHtml(cacheHome, repo);
      emptyEveryBase(cacheHome);
      expect(marksOf(reviewHtml(cacheHome, repo, ...flags))).toMatchObject(BRANCH_CHANGES);
      expect(entriesOf(cacheHome)).toHaveLength(2);
    },
    60_000,
  );

  it('reads the base again over an entry written before a graph document named its checker', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    reviewHtml(cacheHome, repo);
    for (const entry of entriesOf(cacheHome)) {
      writeFileSync(entry, JSON.stringify(BASE_WITH_NO_CHECKER));
    }
    expect(marksOf(reviewHtml(cacheHome, repo))).toMatchObject(BRANCH_CHANGES);
    const [entry = ''] = entriesOf(cacheHome);
    expect(JSON.parse(readFileSync(entry, 'utf8'))).toHaveProperty('checker.name', 'TypeScript');
  }, 60_000);

  it('reads the base again after a change of the lock file in the checkout', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    writeFileSync(join(repo, 'package-lock.json'), '{ "lockfileVersion": 3 }\n');
    reviewHtml(cacheHome, repo);
    emptyEveryBase(cacheHome);
    writeFileSync(join(repo, 'package-lock.json'), '{ "lockfileVersion": 3, "packages": {} }\n');
    expect(marksOf(reviewHtml(cacheHome, repo))).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('reads the base again after a change of the base commit', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    reviewHtml(cacheHome, repo);
    emptyEveryBase(cacheHome);
    expect(marksOf(reviewHtml(cacheHome, repo, '--base', 'HEAD'))).toEqual({});
  }, 60_000);

  it('reads the base again with --no-cache, and does not write the cache', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    reviewHtml(cacheHome, repo, '--no-cache');
    expect(entriesOf(cacheHome)).toEqual([]);

    reviewHtml(cacheHome, repo);
    emptyEveryBase(cacheHome);
    expect(marksOf(reviewHtml(cacheHome, repo, '--no-cache'))).toMatchObject(BRANCH_CHANGES);
    expect(readFileSync(entriesOf(cacheHome)[0] ?? '', 'utf8')).toBe(EMPTY_BASE);
  }, 60_000);

  it('keeps the 20 newest entries for one repo', () => {
    const repo = featureBranchRepo();
    const cacheHome = newCacheHome();
    reviewHtml(cacheHome, repo);
    const [first] = entriesOf(cacheHome);
    const folder = dirname(first ?? '');
    const old = new Date('2026-01-01T00:00:00Z');
    for (let index = 0; index < 20; index += 1) {
      const entry = join(folder, `older-${String(index).padStart(2, '0')}.json`);
      writeFileSync(entry, EMPTY_BASE);
      utimesSync(entry, old, new Date(old.getTime() + index * 1000));
    }

    reviewHtml(cacheHome, repo, '--scope', 'src/**');

    const kept = entriesOf(cacheHome).map((entry) => basename(entry));
    expect(kept).toHaveLength(20);
    expect(kept).toContain(basename(first ?? ''));
    expect(kept).not.toContain('older-00.json');
    expect(kept).not.toContain('older-01.json');
    expect(kept).toContain('older-02.json');
  }, 60_000);

  it.each([
    ['is not JSON', '{ "language": '],
    ['is not a graph document', '{ "language": "typescript" }'],
  ])(
    'reads the base again when a cache file %s',
    (_, text) => {
      const repo = featureBranchRepo();
      const cacheHome = newCacheHome();
      const first = reviewHtml(cacheHome, repo);
      for (const entry of entriesOf(cacheHome)) writeFileSync(entry, text);
      expect(reviewHtml(cacheHome, repo)).toBe(first);
    },
    60_000,
  );

  it('lives under ~/.cache/callmap when XDG_CACHE_HOME is not set', () => {
    const repo = featureBranchRepo();
    const home = newCacheHome();
    const out = join(tempDir('callmap-out-'), 'review.html');
    const { XDG_CACHE_HOME: _, ...environment } = process.env;
    const finished = spawnSync(process.execPath, [CLI, 'review', repo, '--no-open', '--out', out], {
      encoding: 'utf8',
      env: { ...environment, HOME: home },
    });
    expect(finished.status, finished.stderr).toBe(0);
    expect(entriesOf(join(home, '.cache'))).toHaveLength(1);
  }, 60_000);
});

const documentOf = (language: string, file: string): GraphDocument => ({
  language,
  checker: { name: language, version: '1' },
  scope: [],
  files: [file],
  functions: [],
  calls: [],
  openEnds: [],
});

describe('the base cache with one entry for each language', () => {
  const previousCacheHome = process.env['XDG_CACHE_HOME'];
  afterEach(() => {
    if (previousCacheHome === undefined) delete process.env['XDG_CACHE_HOME'];
    else process.env['XDG_CACHE_HOME'] = previousCacheHome;
  });

  const TYPESCRIPT: CachedExtractor = {
    language: 'typescript',
    lockFiles: ['package-lock.json'],
    options: [],
    version: () => 'typescript extractor 1',
  };
  const GO: CachedExtractor = {
    language: 'go',
    lockFiles: ['go.sum', 'go.work.sum'],
    options: [],
    version: () => 'go extractor 1',
  };

  const reviewBase = async (checkout: string, extractors: readonly CachedExtractor[]) => {
    const read: string[] = [];
    const documents = await Promise.all(
      extractors.map((extractor) =>
        throughBaseCache({ repo: checkout, checkout, commit: 'base', scope: [], extractor }, () => {
          read.push(extractor.language);
          return Promise.resolve(documentOf(extractor.language, `read-${read.length}`));
        }),
      ),
    );
    return { read, documents };
  };

  const newCheckout = (): string => {
    process.env['XDG_CACHE_HOME'] = newCacheHome();
    return tempDir('callmap-checkout-');
  };

  it('stores one entry for each language, and reads each again on a second review', async () => {
    const checkout = newCheckout();
    const first = await reviewBase(checkout, [TYPESCRIPT, GO]);
    expect(first.read).toEqual(['typescript', 'go']);
    expect(entriesOf(process.env['XDG_CACHE_HOME'] ?? '')).toHaveLength(2);

    const second = await reviewBase(checkout, [TYPESCRIPT, GO]);
    expect(second.read).toEqual([]);
    expect(second.documents).toEqual(first.documents);
  });

  it('misses only the entry of the language whose extractor has a new version', async () => {
    const checkout = newCheckout();
    await reviewBase(checkout, [TYPESCRIPT, GO]);
    const newGo = { ...GO, version: () => 'go extractor 2' };
    expect((await reviewBase(checkout, [TYPESCRIPT, newGo])).read).toEqual(['go']);
    const newTypescript = { ...TYPESCRIPT, version: () => 'typescript extractor 2' };
    expect((await reviewBase(checkout, [newTypescript, newGo])).read).toEqual(['typescript']);
  });

  it('misses only the entry of the language whose lock file changed', async () => {
    const checkout = newCheckout();
    writeFileSync(join(checkout, 'go.sum'), 'example.com/a v1.0.0 h1:a=\n');
    writeFileSync(join(checkout, 'package-lock.json'), '{ "lockfileVersion": 3 }\n');
    await reviewBase(checkout, [TYPESCRIPT, GO]);
    writeFileSync(join(checkout, 'go.sum'), 'example.com/a v1.0.1 h1:b=\n');
    expect((await reviewBase(checkout, [TYPESCRIPT, GO])).read).toEqual(['go']);
  });

  it('does not give the entry of one language to another language with the same version', async () => {
    const checkout = newCheckout();
    await reviewBase(checkout, [TYPESCRIPT]);
    const sameVersionGo = { ...GO, version: TYPESCRIPT.version, lockFiles: TYPESCRIPT.lockFiles };
    const { read, documents } = await reviewBase(checkout, [sameVersionGo]);
    expect(read).toEqual(['go']);
    expect(documents[0]?.language).toBe('go');
  });
});
