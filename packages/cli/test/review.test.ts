import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, fixtureText, git } from './fixture-repo.ts';
import {
  boxesOf,
  callsOf,
  fakeOpener,
  frameAround,
  framesOf,
  loadReaderPage,
  pageDataOf,
  runCallmap,
} from './reader-page.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const CHECKOUT = 'src/checkout.ts';
const REPORT = 'src/report.ts';
const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';
const RATE = 'src/tax/rate.ts';

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
  out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  stdout = finished.stdout;
  html = readFileSync(out, 'utf8');
}, 120_000);

describe('callmap review on a feature branch', () => {
  it('marks each added, removed and changed function, and each neighbour', () => {
    const marks = Object.fromEntries(
      pageDataOf(html).review.functions.map(({ id, mark }) => [id, mark]),
    );
    expect(marks).toEqual({
      [`${ALERTS}#alert`]: 'changed',
      [`${ALERTS}#relay`]: 'added',
      [`${CART}#label`]: 'neighbour',
      [`${CART}#legacyTotal`]: 'removed',
      [`${CART}#receipt`]: 'changed',
      [`${CART}#subtotal`]: 'neighbour',
      [`${CART}#taxed`]: 'added',
      [`${CHECKOUT}#checkout`]: 'neighbour',
      [`${MONEY}#format`]: 'neighbour',
      [`${NOTIFY}#Mail.send`]: 'neighbour',
      [`${NOTIFY}#Sms.send`]: 'neighbour',
    });
  });

  it('does not mark a function that only moved to another line as changed', () => {
    const ids = pageDataOf(html).review.functions.map(({ id }) => id);
    expect(ids).not.toContain(`${MONEY}#round`);
  });

  it('lists each added and each removed call between the functions it shows', () => {
    expect(pageDataOf(html).review.calls).toEqual([
      { caller: `${ALERTS}#alert`, callee: `${MONEY}#format`, mark: 'added' },
      { caller: `${ALERTS}#alert`, callee: `${NOTIFY}#Mail.send`, mark: 'added' },
      { caller: `${ALERTS}#alert`, callee: `${NOTIFY}#Sms.send`, mark: 'added' },
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
    const { branchGraph } = pageDataOf(html);
    expect(branchGraph.functions.map(({ id }) => id)).toContain(`${MONEY}#round`);
  });

  it('holds the branch text of every file that the review or the search shows, and the base text of every file with a removed or changed function', () => {
    const { sources } = pageDataOf(html);
    expect(sources.branch).toEqual({
      [ALERTS]: fixtureText('branch', ALERTS),
      [CART]: fixtureText('branch', CART),
      [CHECKOUT]: fixtureText('branch', CHECKOUT),
      [MONEY]: fixtureText('branch', MONEY),
      [NOTIFY]: fixtureText('branch', NOTIFY),
      [REPORT]: fixtureText('branch', REPORT),
      [RATE]: fixtureText('branch', RATE),
    });
    expect(sources.base).toEqual({
      [ALERTS]: fixtureText('base', ALERTS),
      [CART]: fixtureText('base', CART),
    });
  });

  it('holds the lines that each changed function had in the base, so the page can show its diff', () => {
    expect(pageDataOf(html).basePlaces).toEqual({
      [`${ALERTS}#alert`]: { firstLine: 3, lastLine: 3 },
      [`${CART}#receipt`]: { firstLine: 10, lastLine: 13 },
    });
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

  it('draws each function the review shows as a box inside the frame of its file', async () => {
    const page = await loadReaderPage(html);
    const boxes = boxesOf(page).filter(({ kind }) => kind === 'function');
    expect(
      boxes
        .map(({ id }) => id)
        .sort()
        .slice(0, 2),
    ).toEqual([`${ALERTS}#alert`, `${ALERTS}#relay`]);
    expect(boxes).toHaveLength(11);
    expect(frameAround(page, `${CART}#taxed`)).toBe(CART);
    expect(
      framesOf(page)
        .map(({ label }) => label)
        .sort(),
    ).toEqual([ALERTS, CART, CHECKOUT, MONEY, NOTIFY]);
  });

  it('draws each call as an arrow from the caller to the callee, with its mark', async () => {
    const arrows = callsOf(await loadReaderPage(html)).map(({ from, to, classes }) => ({
      caller: from,
      callee: to,
      mark: ['added', 'removed', 'kept'].find((mark) => classes.includes(mark)),
    }));
    expect(arrows).toEqual(pageDataOf(html).review.calls);
  });

  it('marks each box with its mark', async () => {
    const classesOf = new Map(
      boxesOf(await loadReaderPage(html)).map(({ id, classes }) => [id, classes]),
    );
    expect(classesOf.get(`${CART}#legacyTotal`)).toContain('removed');
    expect(classesOf.get(`${MONEY}#format`)).toContain('neighbour');
  });

  it('places every box the same way on every load, and the boxes of one file and one column in line order', async () => {
    const placed = async () => boxesOf(await loadReaderPage(html));
    const boxes = await placed();
    expect(await placed()).toEqual(boxes);
    const boxOf = (name: string) => boxes.find(({ id }) => id === `${CART}#${name}`);
    const [taxed, label] = [boxOf('taxed'), boxOf('label')];
    if (taxed === undefined || label === undefined) throw new Error('the drawing lost a box');
    expect(taxed.x + taxed.width).toBeGreaterThan(label.x);
    expect(label.x + label.width).toBeGreaterThan(taxed.x);
    expect(taxed.y).toBeLessThan(label.y);
  });
});

describe('opening the page', () => {
  it('opens the page in the browser when the run ends', async () => {
    const opener = fakeOpener();
    const target = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'opened.html');
    const finished = runCallmap(['review', repo, '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    await expect.poll(() => existsSync(opener.marker), { timeout: 5_000 }).toBe(true);
    expect(readFileSync(opener.marker, 'utf8')).toBe(target);
  }, 120_000);

  it('opens no browser with --no-open, and still writes the page', async () => {
    const opener = fakeOpener();
    const target = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'closed.html');
    const finished = runCallmap(['review', repo, '--no-open', '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    expect(existsSync(target)).toBe(true);
    await new Promise((settle) => setTimeout(settle, 500));
    expect(existsSync(opener.marker)).toBe(false);
  }, 120_000);
});
