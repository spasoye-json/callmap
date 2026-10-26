import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { pageDataOf, runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';

let repo = '';

const pageOfReview = (...flags: readonly string[]) => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return pageDataOf(readFileSync(out, 'utf8'));
};

beforeAll(() => {
  repo = featureBranchRepo();
});

describe('the scope of a review', () => {
  it('shows only the functions of the files that the --scope glob takes', () => {
    const marks = Object.fromEntries(
      pageOfReview('--scope', CART).review.functions.map(({ id, mark }) => [id, mark]),
    );
    expect(marks).toEqual({
      [`${CART}#label`]: 'neighbour',
      [`${CART}#legacyTotal`]: 'removed',
      [`${CART}#receipt`]: 'changed',
      [`${CART}#subtotal`]: 'neighbour',
      [`${CART}#taxed`]: 'added',
    });
  }, 60_000);

  it('takes the files of every --scope glob', () => {
    const { review, branchGraph } = pageOfReview('--scope', 'src/c*.ts', '--scope', MONEY);
    expect(new Set(review.functions.map(({ file }) => file))).toEqual(
      new Set([CART, 'src/checkout.ts', MONEY]),
    );
    expect(new Set(branchGraph.functions.map(({ file }) => file))).toEqual(
      new Set([CART, 'src/checkout.ts', MONEY]),
    );
  }, 60_000);

  it('leaves out the files of a negated --scope glob, from the graph and from the review', () => {
    const { review, branchGraph } = pageOfReview('--scope', 'src/**', '--scope', '!src/c*.ts');
    const files = new Set([...review.functions, ...branchGraph.functions].map(({ file }) => file));
    expect([...files].filter((file) => file.startsWith('src/c'))).toEqual([]);
    expect(files.has(MONEY)).toBe(true);
  }, 60_000);
});
