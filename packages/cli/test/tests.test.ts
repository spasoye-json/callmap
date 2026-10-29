import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GraphDocument } from '@callmap/graph-document';
import { effectiveScope } from '@callmap/scope';
import type { Extractor } from '../src/extractors.ts';
import { runReview } from '../src/review-command.ts';
import { DIFF_LIMIT } from '../page/views/diff.ts';
import { git, goRepo } from './fixture-repo.ts';
import { pageDataOf, runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const GO_TEST = 'checkout/checkout_test.go';
const TS_TEST = 'web/greet.test.ts';
const TS_TEST_FOLDER = 'web/__tests__/names.ts';
const GO_TEST_FOLDER = 'test/e2e/e2e.go';
const TEST_FILES = [GO_TEST, TS_TEST, TS_TEST_FOLDER, GO_TEST_FOLDER];

const write = (repo: string, files: Readonly<Record<string, string>>, message: string): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', message);
};

const repoWithTests = (): string => {
  const repo = goRepo();
  git(repo, 'checkout', '--quiet', 'main');
  write(
    repo,
    {
      [GO_TEST]: 'package checkout\n\nfunc TestTotal() { Total(nil) }\n',
      [TS_TEST]:
        "import { greet } from './greet';\n\nexport const checkGreet = (): string => greet('a');\n",
      [TS_TEST_FOLDER]: 'export const names = (): readonly string[] => [];\n',
      [GO_TEST_FOLDER]: 'package e2e\n\nfunc Run() {}\n',
    },
    'tests',
  );
  git(repo, 'checkout', '--quiet', 'feature');
  git(repo, 'merge', '--quiet', '--no-edit', 'main');
  write(
    repo,
    {
      [GO_TEST]: 'package checkout\n\nfunc TestTotal() { Total(nil); Total([]int{1}) }\n',
      [TS_TEST]:
        "import { greet } from './greet';\n\nexport const checkGreet = (): string => greet('a') + greet('b');\n",
    },
    'change the tests',
  );
  return repo;
};

const isTestFile = (file: string): boolean => TEST_FILES.includes(file);

let repo = '';
let cacheHome = '';

const pageOfReview = (...flags: readonly string[]) => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(
    ['review', repo, '--no-open', '--out', out, ...flags],
    undefined,
    cacheHome,
  );
  expect(finished.status, finished.stderr).toBe(0);
  return pageDataOf(readFileSync(out, 'utf8'));
};

beforeAll(() => {
  repo = repoWithTests();
  cacheHome = tempDir('callmap-cache-');
}, 60_000);

describe('the test files of a review', () => {
  it('shows no function of a test file, in the Diff view and in the Whole project view', () => {
    const { review, branchGraph } = pageOfReview();
    expect(review.functions.filter(({ file }) => isTestFile(file))).toEqual([]);
    expect(branchGraph.functions.filter(({ file }) => isTestFile(file))).toEqual([]);
    expect(review.functions.map(({ file }) => file)).toContain('checkout/checkout.go');
  }, 120_000);

  it('reads the test files with --tests, from a base entry of its own', () => {
    const { review, branchGraph } = pageOfReview('--tests');
    const marks = review.functions
      .filter(({ file }) => isTestFile(file))
      .map(({ id, mark }) => `${mark} ${id}`);
    expect(marks).toEqual(
      expect.arrayContaining([`changed ${GO_TEST}#TestTotal`, `changed ${TS_TEST}#checkGreet`]),
    );
    expect(marks.filter((mark) => mark.startsWith('added'))).toEqual([]);
    expect(new Set(branchGraph.functions.map(({ file }) => file))).toEqual(
      new Set([
        ...TEST_FILES,
        'checkout/checkout.go',
        'checkout/pay.go',
        'money/money.go',
        'web/greet.ts',
      ]),
    );
  }, 120_000);

  it('keeps a test file out under a --scope glob of the user, and --tests puts it back', () => {
    const filesOf = (...flags: readonly string[]): ReadonlySet<string> =>
      new Set(
        pageOfReview('--scope', 'web/**', ...flags).branchGraph.functions.map(({ file }) => file),
      );
    expect(filesOf()).toEqual(new Set(['web/greet.ts']));
    expect(filesOf('--tests')).toEqual(new Set(['web/greet.ts', TS_TEST, TS_TEST_FOLDER]));
  }, 120_000);
});

describe('the scope that the launcher gives each extractor', () => {
  const scopesOfRun = async (scope: readonly string[], tests: boolean) => {
    const given: (readonly string[])[] = [];
    const recording: Extractor = {
      language: 'typescript',
      dependencyFiles: [],
      options: [],
      version: () => 'recording',
      claimsAnyOf: () => true,
      readsInParallel: false,
      extract: (_repo, extractedScope) => {
        given.push(extractedScope);
        const document: GraphDocument = {
          language: 'typescript',
          checker: { name: 'TypeScript', version: '0' },
          scope: extractedScope,
          files: [],
          functions: [],
          calls: [],
          openEnds: [],
        };
        return Promise.resolve(document);
      },
    };
    await runReview(
      {
        repo,
        base: undefined,
        scope,
        tsconfig: undefined,
        out: join(tempDir('callmap-out-'), 'review.html'),
        open: false,
        cache: false,
        editor: 'vscode',
        tests,
      },
      { diffLimit: DIFF_LIMIT, extractors: [recording] },
    );
    return given;
  };

  it('is the scope of the user with each test glob once, for the branch and for the base', async () => {
    const scope = ['web/**', '!**/*.test.*'];
    expect(await scopesOfRun(scope, false)).toEqual([
      effectiveScope(scope, false),
      effectiveScope(scope, false),
    ]);
  }, 60_000);

  it('is the scope of the user alone with --tests', async () => {
    expect(await scopesOfRun(['web/**'], true)).toEqual([['web/**'], ['web/**']]);
  }, 60_000);
});
