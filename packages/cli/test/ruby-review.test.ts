import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { getByRole, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { rubyExtractor } from '../src/extractors.ts';
import type { Extractor } from '../src/extractors.ts';
import { runReview } from '../src/review-command.ts';
import { commitFile, rubyRepo } from './fixture-repo.ts';
import { cacheEntriesOf, reviewOf } from './cached-review.ts';
import { pathWithout } from './path-without.ts';
import { loadReaderPage, pageDataOf } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const ORDER = 'app/models/order.rb';
const CHECKOUT = 'app/services/checkout.rb';
const GREET = 'web/greet.ts';

const rubyVersion = (): string => execFileSync('ruby', ['--version'], { encoding: 'utf8' }).trim();

const pathWithAnotherRuby = (): string => {
  const bin = tempDir('callmap-other-ruby-');
  const realRuby = execFileSync('ruby', ['-e', 'print RbConfig.ruby'], { encoding: 'utf8' });
  writeFileSync(
    join(bin, 'ruby'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "ruby 9.9.9 (2099-01-01) [fake]"; exit 0; fi\nexec "${realRuby}" "$@"\n`,
    { mode: 0o755 },
  );
  return `${bin}${delimiter}${process.env['PATH'] ?? ''}`;
};

let repo = '';
let cacheHome = '';
let html = '';
let stderr = '';

beforeAll(() => {
  repo = rubyRepo();
  cacheHome = tempDir('callmap-cache-');
  ({ html, stderr } = reviewOf(repo, cacheHome));
}, 120_000);

describe('callmap review of a branch with Ruby and TypeScript', () => {
  it('marks the Ruby methods that the branch added, changed and removed, next to the TypeScript ones', () => {
    expect(pageDataOf(html).review.functions.map(({ id, mark }) => `${mark} ${id}`)).toEqual(
      expect.arrayContaining([
        `changed ${ORDER}#Order#total`,
        `added ${ORDER}#Order#tax`,
        `removed ${ORDER}#Order#legacy_total`,
        `added ${CHECKOUT}#Checkout#receipt`,
        `changed ${GREET}#greet`,
        `added ${GREET}#shout`,
      ]),
    );
  });

  it('marks the Ruby calls that the branch added, removed and kept', () => {
    expect(
      pageDataOf(html).review.calls.map(
        ({ caller, callee, mark }) => `${mark} ${caller} ${callee}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        `added ${ORDER}#Order#total ${ORDER}#Order#tax`,
        `kept ${ORDER}#Order#total ${ORDER}#Order#subtotal`,
        `removed ${ORDER}#Order#legacy_total ${ORDER}#Order#total`,
        `added ${CHECKOUT}#Checkout#receipt ${CHECKOUT}#Checkout#run`,
        `added ${GREET}#greet ${GREET}#shout`,
      ]),
    );
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
      { language: 'ruby', checker: 'Callmap Ruby rules', resolved: 4, open: 0 },
      { language: 'typescript', checker: 'TypeScript', resolved: 2, open: 0 },
    ]);
  });

  it('shows the rate of Ruby next to the rules and the ruby that proved its calls', async () => {
    const { window } = await loadReaderPage(html);
    const rate = within(getByRole(window.document.body, 'region', { name: 'Resolution rate' }));
    const checker = `Callmap Ruby rules 7, ${rubyVersion()}`;
    expect(rate.getByRole('group', { name: checker }).textContent).toContain(`${checker} · 100.0%`);
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

describe('callmap review of a Ruby constant that does not resolve', () => {
  it('shows the open end with the words code not found', async () => {
    const root = rubyRepo();
    commitFile(
      root,
      'app/services/refund.rb',
      'class Refund\n  def run\n    Ledger.total\n  end\nend\n',
    );
    const page = await loadReaderPage(reviewOf(root, tempDir('callmap-cache-')).html);
    const region = within(getByRole(page.window.document.body, 'region', { name: 'Open ends' }));
    expect(
      region.getByRole('button', { name: 'Ledger.total line 3 · code not found' }),
    ).toBeDefined();
  }, 60_000);
});

describe('the base cache of a Ruby review', () => {
  it('keeps the Ruby entry when Gemfile.lock changes', () => {
    const root = rubyRepo();
    const cache = tempDir('callmap-cache-');
    reviewOf(root, cache);
    commitFile(root, 'Gemfile.lock', 'GEM\n  specs:\n    rake (13.3.0)\n');
    reviewOf(root, cache);
    expect(cacheEntriesOf(cache)).toHaveLength(2);
  }, 60_000);

  it('reads the base again with a new ruby', () => {
    const root = rubyRepo();
    const cache = tempDir('callmap-cache-');
    reviewOf(root, cache);
    reviewOf(root, cache, pathWithAnotherRuby());
    expect(cacheEntriesOf(cache)).toHaveLength(3);
  }, 60_000);
});

describe('callmap review with no ruby on the PATH', () => {
  it('writes the TypeScript page, and prints one line that it skipped Ruby', () => {
    const skipped = reviewOf(rubyRepo(), tempDir('callmap-cache-'), pathWithout('ruby'));
    expect(skipped.stderr).toBe(
      'callmap skipped the Ruby files, because ruby is not on the PATH.\n',
    );
    const { review } = pageDataOf(skipped.html);
    expect(review.functions.map(({ id }) => id).every((id) => id.startsWith('web/'))).toBe(true);
    expect(review.resolutionRates.map(({ language }) => language)).toEqual(['typescript']);
  }, 60_000);
});

describe('callmap review of a Ruby file that Ripper cannot parse', () => {
  it('writes the page, and prints the name of the file', () => {
    const root = rubyRepo();
    commitFile(root, 'app/models/broken.rb', 'class Broken\n  def oops(\nend\n');
    const { html, stderr } = reviewOf(root, tempDir('callmap-cache-'));
    expect(stderr).toBe(
      'callmap read no functions in app/models/broken.rb, because Ripper could not parse it.\n',
    );
    expect(pageDataOf(html).review.functions.map(({ id }) => id)).toContain(`${ORDER}#Order#total`);
  }, 60_000);
});

describe('the reads of the Ruby extractor', () => {
  it('reads the branch and then the base, one after the other', async () => {
    const root = rubyRepo();
    const steps: string[] = [];
    const ruby = rubyExtractor();
    const watched: Extractor = {
      ...ruby,
      extract: async (path, scope) => {
        const what = path === root ? 'branch' : 'base';
        steps.push(`start ${what}`);
        const document = await ruby.extract(path, scope);
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
        tests: false,
      },
      { diffLimit: 2000, extractors: [watched] },
    );
    expect(steps).toEqual(['start branch', 'end branch', 'start base', 'end base']);
  }, 60_000);
});
