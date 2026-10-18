import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, git } from './fixture-repo.ts';
import { pageDataOf, runArchmap } from './reader-page.ts';

const TOTAL = 'app/src/total.ts';
const RECEIPT = 'app/src/receipt.ts';

let repo = '';

const appWithBaseUrlImports = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'archmap-review-'));
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  mkdirSync(join(root, 'app/src'), { recursive: true });
  commitFile(root, 'app/tsconfig.json', '{ "compilerOptions": { "baseUrl": "./" } }\n');
  commitFile(root, TOTAL, 'export const total = (): number => 1;\n');
  commitFile(
    root,
    RECEIPT,
    "import { total } from 'src/total';\n\nexport const legacy = (): number => total();\n",
  );
  git(root, 'checkout', '--quiet', '-b', 'feature');
  commitFile(
    root,
    RECEIPT,
    "import { total } from 'src/total';\n\nexport const receipt = (): number => total();\n",
  );
  return root;
};

const pageOfReview = (...flags: readonly string[]) => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return pageDataOf(readFileSync(out, 'utf8'));
};

beforeAll(() => {
  repo = appWithBaseUrlImports();
});

describe('the TypeScript config of a review', () => {
  it('reads the config that --tsconfig names, on the branch and on the base', () => {
    const { review } = pageOfReview('--tsconfig', 'app/tsconfig.json');
    expect(review.calls).toEqual([
      { caller: `${RECEIPT}#legacy`, callee: `${TOTAL}#total`, mark: 'removed' },
      { caller: `${RECEIPT}#receipt`, callee: `${TOTAL}#total`, mark: 'added' },
    ]);
    expect(review.openEnds).toEqual([]);
  }, 60_000);

  it('reads the config that an absolute --tsconfig names, on the branch and on the base', () => {
    const { review } = pageOfReview('--tsconfig', join(repo, 'app/tsconfig.json'));
    expect(review.calls).toEqual([
      { caller: `${RECEIPT}#legacy`, callee: `${TOTAL}#total`, mark: 'removed' },
      { caller: `${RECEIPT}#receipt`, callee: `${TOTAL}#total`, mark: 'added' },
    ]);
  }, 60_000);
});
