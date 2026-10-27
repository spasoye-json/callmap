import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { getByRole, within } from '@testing-library/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { goExtractor } from '../src/extractors.ts';
import type { Extractor } from '../src/extractors.ts';
import { runReview } from '../src/review-command.ts';
import { commitFile, featureBranchRepo, goRepo } from './fixture-repo.ts';
import { loadReaderPage, pageDataOf, runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const MONEY = 'money/money.go';
const CHECKOUT = 'checkout/checkout.go';
const PAY = 'checkout/pay.go';
const GREET = 'web/greet.ts';

const goVersion = (): string =>
  /go version go(\S+)/.exec(execFileSync('go', ['version'], { encoding: 'utf8' }))?.[1] ?? '';

const reviewOf = (repo: string, cacheHome: string, path?: string) => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(
    ['review', repo, '--no-open', '--out', out],
    undefined,
    cacheHome,
    path === undefined ? {} : { PATH: path },
  );
  expect(finished.status, finished.stderr).toBe(0);
  return { html: readFileSync(out, 'utf8'), stderr: finished.stderr };
};

const cacheEntriesOf = (cacheHome: string): readonly string[] =>
  readdirSync(join(cacheHome, 'callmap'), { recursive: true, encoding: 'utf8' }).filter((entry) =>
    entry.endsWith('.json'),
  );

const pathWithoutGo = (): string =>
  (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter((folder) => !existsSync(join(folder, 'go')))
    .join(delimiter);

let repo = '';
let cacheHome = '';
let html = '';
let stderr = '';

beforeAll(() => {
  repo = goRepo();
  cacheHome = tempDir('callmap-cache-');
  ({ html, stderr } = reviewOf(repo, cacheHome));
}, 120_000);

describe('callmap review of a branch with Go and TypeScript', () => {
  it('marks the Go functions that the branch added, changed and removed, next to the TypeScript ones', () => {
    expect(pageDataOf(html).review.functions.map(({ id, mark }) => `${mark} ${id}`)).toEqual(
      expect.arrayContaining([
        `changed ${CHECKOUT}#Total`,
        `added ${CHECKOUT}#Receipt`,
        `removed ${CHECKOUT}#LegacyTotal`,
        `changed ${MONEY}#Format`,
        `added ${MONEY}#Round`,
        `changed ${GREET}#greet`,
        `added ${GREET}#shout`,
      ]),
    );
  });

  it('marks the Go calls that the branch added and removed', () => {
    expect(
      pageDataOf(html).review.calls.map(
        ({ caller, callee, mark }) => `${mark} ${caller} ${callee}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        `added ${CHECKOUT}#Total ${MONEY}#Round`,
        `added ${CHECKOUT}#Receipt ${CHECKOUT}#Total`,
        `removed ${CHECKOUT}#LegacyTotal ${CHECKOUT}#Total`,
        `added ${MONEY}#Round ${MONEY}#whole`,
        `kept ${CHECKOUT}#Total ${MONEY}#Format`,
        `added ${GREET}#greet ${GREET}#shout`,
      ]),
    );
  });

  it('draws a Go call through an interface as one one-of group', () => {
    expect(pageDataOf(html).review.oneOfGroups).toEqual([
      {
        id: `${PAY}:20:15`,
        caller: `${PAY}#Charge`,
        line: 20,
        callees: [`${PAY}#Card.Pay`, `${PAY}#Wallet.Pay`],
      },
    ]);
  });

  it('gives one resolution rate and one checker for each language', () => {
    expect(
      pageDataOf(html).review.resolutionRates.map(({ language, checker, resolved, open }) => ({
        language,
        checker: checker.name,
        resolved,
        open,
      })),
    ).toEqual([
      { language: 'go', checker: 'Go', resolved: 6, open: 0 },
      { language: 'typescript', checker: 'TypeScript', resolved: 2, open: 0 },
    ]);
  });

  it('shows the rate of Go next to the go that proved its calls', async () => {
    const { window } = await loadReaderPage(html);
    const rate = within(getByRole(window.document.body, 'region', { name: 'Resolution rate' }));
    expect(rate.getByRole('group', { name: `Go ${goVersion()}` }).textContent).toContain(
      `Go ${goVersion()} · 100.0%`,
    );
  });

  it('prints no note when every language has its tool', () => {
    expect(stderr).toBe('');
  });

  it('keeps one base cache entry for each language, and reads both from the cache next time', () => {
    expect(cacheEntriesOf(cacheHome)).toHaveLength(2);
    expect(reviewOf(repo, cacheHome).html).toBe(html);
    expect(cacheEntriesOf(cacheHome)).toHaveLength(2);
  }, 60_000);
});

describe('callmap review of a Go call into code that does not load', () => {
  it('shows the open end with the words code not found', async () => {
    const root = goRepo();
    commitFile(
      root,
      'checkout/audit.go',
      [
        'package checkout',
        '',
        'import "example.com/shop/gen"',
        '',
        'func Audit(cents int) {',
        '\tgen.Log(cents)',
        '}',
        '',
      ].join('\n'),
    );
    const page = await loadReaderPage(reviewOf(root, tempDir('callmap-cache-')).html);
    const region = within(getByRole(page.window.document.body, 'region', { name: 'Open ends' }));
    expect(region.getByRole('button', { name: 'gen.Log line 6 · code not found' })).toBeDefined();
  }, 60_000);
});

describe('callmap review with no go on the PATH', () => {
  it('writes the TypeScript page, and prints one line that it skipped Go', () => {
    const skipped = reviewOf(goRepo(), tempDir('callmap-cache-'), pathWithoutGo());
    expect(skipped.stderr).toBe('callmap skipped the Go files, because go is not on the PATH.\n');
    const { review } = pageDataOf(skipped.html);
    expect(review.functions.map(({ id }) => id).every((id) => id.startsWith('web/'))).toBe(true);
    expect(review.resolutionRates.map(({ language }) => language)).toEqual(['typescript']);
  }, 60_000);
});

describe('callmap review of a repo whose Go files the Go extractor never reads', () => {
  it('runs no Go extractor, and prints no line about Go when go is not on the PATH', () => {
    const repo = featureBranchRepo();
    mkdirSync(join(repo, 'testdata'));
    commitFile(repo, 'testdata/sample.go', 'package sample\n');
    mkdirSync(join(repo, 'tools'));
    commitFile(repo, 'tools/lint.go', 'package tools\n');
    const withGo = reviewOf(repo, tempDir('callmap-cache-'));
    expect(pageDataOf(withGo.html).review.resolutionRates.map(({ language }) => language)).toEqual([
      'typescript',
    ]);
    expect(reviewOf(repo, tempDir('callmap-cache-'), pathWithoutGo()).stderr).toBe('');
  }, 60_000);
});

describe('the go of a review', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs the local go, and downloads no toolchain, when GOTOOLCHAIN names a go that is not on the machine', () => {
    vi.stubEnv('GOTOOLCHAIN', 'go1.99.0');
    vi.stubEnv('GOPROXY', 'off');
    expect(goExtractor().skipNote?.()).toBeUndefined();
  });

  it('runs the local go, and downloads no toolchain, when the go.mod of the current folder names a go that is not on the machine', () => {
    const folder = tempDir('callmap-go-toolchain-');
    writeFileSync(
      join(folder, 'go.mod'),
      'module example.com/shop\n\ngo 1.22\n\ntoolchain go1.99.0\n',
    );
    const started = process.cwd();
    process.chdir(folder);
    try {
      expect(goExtractor().skipNote?.()).toBeUndefined();
    } finally {
      process.chdir(started);
    }
  });

  it('skips Go with one line that names the go it needs, when the go on the PATH is older', () => {
    const bin = tempDir('callmap-old-go-');
    writeFileSync(join(bin, 'go'), '#!/bin/sh\necho "go version go1.25.3 linux/amd64"\n', {
      mode: 0o755,
    });
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env['PATH'] ?? ''}`);
    expect(goExtractor().skipNote?.()).toBe(
      'callmap skipped the Go files, because the Go extractor needs go 1.26 or later, and the go on the PATH is go1.25.3.',
    );
  });
});

describe('the reads of the Go extractor', () => {
  it('reads the branch and then the base, one after the other', async () => {
    const root = goRepo();
    const steps: string[] = [];
    const go = goExtractor();
    const watched: Extractor = {
      ...go,
      extract: async (path, scope) => {
        const what = path === root ? 'branch' : 'base';
        steps.push(`start ${what}`);
        const document = await go.extract(path, scope);
        steps.push(`end ${what}`);
        return document;
      },
    };
    await runReview(
      {
        repo: root,
        base: undefined,
        scope: [],
        tsconfig: undefined,
        out: join(tempDir('callmap-out-'), 'review.html'),
        open: false,
        cache: false,
        editor: 'vscode',
      },
      { diffLimit: 2000, extractors: [watched] },
    );
    expect(steps).toEqual(['start branch', 'end branch', 'start base', 'end base']);
  }, 60_000);
});
