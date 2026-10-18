import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { pageDataOf, runArchmap } from './reader-page.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';

let repo = '';

const pageOfReview = (...flags: readonly string[]) => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out, ...flags]);
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

  it('takes the files of every --scope glob, and carries the globs in the graph', () => {
    const { review, graph } = pageOfReview('--scope', 'src/c*.ts', '--scope', MONEY);
    expect(new Set(review.functions.map(({ file }) => file))).toEqual(
      new Set([CART, 'src/checkout.ts', MONEY]),
    );
    expect(graph.scope).toEqual(['src/c*.ts', MONEY]);
  }, 60_000);

  it('leaves out the files of a negated --scope glob, from the graph and from the review', () => {
    const { review, graph } = pageOfReview('--scope', 'src/**', '--scope', '!src/c*.ts');
    const files = new Set([...review.functions, ...graph.functions].map(({ file }) => file));
    expect([...files].filter((file) => file.startsWith('src/c'))).toEqual([]);
    expect(files.has(MONEY)).toBe(true);
    expect(graph.scope).toEqual(['src/**', '!src/c*.ts']);
  }, 60_000);
});
