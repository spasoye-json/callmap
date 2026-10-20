import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  linesOf,
  loadReaderPage,
  openTab,
  runCallmap,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const CART = 'src/cart.ts';
const REPORT = 'src/report.ts';
const RATE = 'src/tax/rate.ts';
const MONEY = 'src/money.ts';
const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';

let html = '';

beforeAll(() => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(['review', featureBranchRepo(), '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  html = readFileSync(out, 'utf8');
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

describe('the tabs of the views', () => {
  it('has a tab for each view, and opens the Diff tab when the page loads', async () => {
    const body = bodyOf(await loadReaderPage(html));
    expect(body.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Diff',
      'Whole project',
      'Folder',
      'Route',
    ]);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Diff');
  });

  it('draws the view of a tab after a click on it, and the Diff view again after a click back', async () => {
    const page = await loadReaderPage(html);
    expect(boxElementOf(page, REPORT)).toBeUndefined();
    await openTab(page, 'Whole project');
    expect(bodyOf(page).getByRole('tab', { selected: true }).textContent).toBe('Whole project');
    expect(boxElementOf(page, REPORT)).toBeDefined();
    await openTab(page, 'Diff');
    expect(boxElementOf(page, REPORT)).toBeUndefined();
    expect(boxElementOf(page, `${CART}#receipt`)).toBeDefined();
  });

  it('opens the next tab and the tab before it with the arrow keys', async () => {
    const page = await loadReaderPage(html);
    const body = bodyOf(page);
    fireEvent.keyDown(body.getByRole('tab', { name: 'Diff' }), { key: 'ArrowRight' });
    await settled(page);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Whole project');
    expect(page.window.document.activeElement?.textContent).toBe('Whole project');
    fireEvent.keyDown(body.getByRole('tab', { name: 'Whole project' }), { key: 'ArrowLeft' });
    await settled(page);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Diff');
  });
});

const projectPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await openTab(page, 'Whole project');
  return page;
};

describe('the Whole project view of a scope with files at its top', () => {
  it('shows one box for each file of the top folder, and no function box', async () => {
    const page = await projectPage();
    expect(Object.fromEntries(boxesOf(page).map(({ id, label }) => [id, label]))).toEqual({
      [ALERTS]: 'alerts.ts',
      [CART]: 'cart.ts',
      'src/checkout.ts': 'checkout.ts',
      [MONEY]: 'money.ts',
      [NOTIFY]: 'notify.ts',
      [REPORT]: 'report.ts',
      [RATE]: 'tax/rate.ts',
    });
  });

  it('draws the calls between two files as one line with their count', async () => {
    const page = await projectPage();
    const between = linesOf(page).filter(({ from, to }) => from === CART && to === MONEY);
    expect(between.map(({ label, classes }) => [label, classes.includes('bundled')])).toEqual([
      ['2', true],
    ]);
  });

  it('marks the line of the calls that the branch added', async () => {
    const page = await projectPage();
    const added = linesOf(page).find(({ from, to }) => from === ALERTS && to === NOTIFY);
    expect([added?.label, added?.classes.includes('added')]).toEqual(['2', true]);
  });

  it('lists the calls of a line after Enter on it', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    fireEvent.keyDown(body.getByRole('button', { name: `2 calls from ${CART} to ${MONEY}` }), {
      key: 'Enter',
    });
    expect(
      within(body.getByRole('region', { name: 'Calls' }))
        .getAllByRole('button')
        .map((call) => call.textContent),
    ).toEqual(['receipt calls format', 'subtotal calls round']);
  });
});
