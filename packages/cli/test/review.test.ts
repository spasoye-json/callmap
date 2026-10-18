import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, git } from './fixture-repo.ts';
import { fakeOpener, loadReaderPage, pageDataOf, runArchmap } from './reader-page.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const CHECKOUT = 'src/checkout.ts';

let repo = '';
let html = '';
let stdout = '';
let out = '';
let branchBefore = '';
let statusBefore = '';

beforeAll(() => {
  repo = featureBranchRepo();
  branchBefore = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  statusBefore = git(repo, 'status', '--porcelain');
  out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  stdout = finished.stdout;
  html = readFileSync(out, 'utf8');
}, 120_000);

describe('archmap review on a feature branch', () => {
  it('marks each added, removed and changed function, and each neighbour', () => {
    const marks = Object.fromEntries(
      pageDataOf(html).review.functions.map(({ id, mark }) => [id, mark]),
    );
    expect(marks).toEqual({
      [`${CART}#label`]: 'neighbour',
      [`${CART}#legacyTotal`]: 'removed',
      [`${CART}#receipt`]: 'changed',
      [`${CART}#subtotal`]: 'neighbour',
      [`${CART}#taxed`]: 'added',
      [`${CHECKOUT}#checkout`]: 'neighbour',
      [`${MONEY}#format`]: 'neighbour',
    });
  });

  it('does not mark a function that only moved to another line as changed', () => {
    const ids = pageDataOf(html).review.functions.map(({ id }) => id);
    expect(ids).not.toContain(`${MONEY}#round`);
  });

  it('lists each added and each removed call between the functions it shows', () => {
    expect(pageDataOf(html).review.calls).toEqual([
      { caller: `${CART}#legacyTotal`, callee: `${CART}#subtotal`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#label`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#legacyTotal`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#taxed`, mark: 'added' },
      { caller: `${CART}#receipt`, callee: `${MONEY}#format`, mark: 'kept' },
      { caller: `${CART}#taxed`, callee: `${CART}#subtotal`, mark: 'added' },
      { caller: `${CHECKOUT}#checkout`, callee: `${CART}#receipt`, mark: 'kept' },
    ]);
  });

  it('holds the whole branch graph in the data block, so the page can open more of it', () => {
    const { graph } = pageDataOf(html);
    expect(graph.functions.map(({ id }) => id)).toContain(`${MONEY}#round`);
  });

  it('writes the page to the path that --out names, and prints that path', () => {
    expect(stdout.trim()).toBe(out);
  });

  it('leaves the checkout and the working tree as they were', () => {
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(branchBefore);
    expect(git(repo, 'status', '--porcelain')).toBe(statusBefore);
  });

  it('removes the temporary worktree of the base when it ends', () => {
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });
});

describe('the reader page', () => {
  it('inlines every script and style, so it makes no network request', () => {
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|url\(\s*['"]?https?:/i);
  });

  it('draws each function the review shows as a box inside the frame of its file', () => {
    const { graph } = loadReaderPage(html);
    const boxes = graph.nodes('.function');
    expect(
      boxes
        .map((box) => box.id())
        .sort()
        .slice(0, 2),
    ).toEqual([`${CART}#label`, `${CART}#legacyTotal`]);
    expect(boxes).toHaveLength(7);
    expect(graph.getElementById(`${CART}#taxed`).parent().data('label')).toBe(CART);
    expect(
      graph
        .nodes('.file-frame')
        .map((frame) => frame.data('label') as string)
        .sort(),
    ).toEqual([CART, CHECKOUT, MONEY]);
  });

  it('draws each call as an arrow from the caller to the callee, with its mark', () => {
    const { graph } = loadReaderPage(html);
    const arrows = graph.edges().map((edge) => ({
      caller: edge.source().id(),
      callee: edge.target().id(),
      mark: ['added', 'removed', 'kept'].find((mark) => edge.hasClass(mark)),
    }));
    expect(arrows).toEqual(pageDataOf(html).review.calls);
  });

  it('marks each box with its mark', () => {
    const { graph } = loadReaderPage(html);
    expect(graph.getElementById(`${CART}#legacyTotal`).hasClass('removed')).toBe(true);
    expect(graph.getElementById(`${MONEY}#format`).hasClass('neighbour')).toBe(true);
  });

  it('places every box the same way on every load, and the boxes of one file in line order', () => {
    const positions = () =>
      loadReaderPage(html)
        .graph.nodes('.function')
        .map((box) => [box.id(), box.position()]);
    expect(positions()).toEqual(positions());
    const { graph } = loadReaderPage(html);
    const y = (name: string) => graph.getElementById(`${CART}#${name}`).position('y');
    expect(y('subtotal')).toBeLessThan(y('taxed'));
    expect(y('taxed')).toBeLessThan(y('receipt'));
  });
});

describe('opening the page', () => {
  it('opens the page in the browser when the run ends', async () => {
    const opener = fakeOpener();
    const target = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'opened.html');
    const finished = runArchmap(['review', repo, '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    await expect.poll(() => existsSync(opener.marker), { timeout: 5_000 }).toBe(true);
    expect(readFileSync(opener.marker, 'utf8')).toBe(target);
  }, 120_000);

  it('opens no browser with --no-open, and still writes the page', async () => {
    const opener = fakeOpener();
    const target = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'closed.html');
    const finished = runArchmap(['review', repo, '--no-open', '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    expect(existsSync(target)).toBe(true);
    await new Promise((settle) => setTimeout(settle, 500));
    expect(existsSync(opener.marker)).toBe(false);
  }, 120_000);
});
