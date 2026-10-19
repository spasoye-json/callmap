import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  clickBox,
  framesAround,
  framesOf,
  linesOf,
  loadReaderPage,
  openTab,
  pageDataOf,
  runCallmap,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const REPORT = 'src/report.ts';
const RATE = 'src/tax/rate.ts';
const MONEY = 'src/money.ts';
const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';

const fileOf = (end: string): string => end.replace(/^frame:/, '').replace(/#.*$/, '');

let html = '';

beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
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
    expect(boxElementOf(page, `${REPORT}#heading`)).toBeUndefined();
    await openTab(page, 'Whole project');
    expect(bodyOf(page).getByRole('tab', { selected: true }).textContent).toBe('Whole project');
    expect(boxElementOf(page, `${REPORT}#heading`)).toBeDefined();
    await openTab(page, 'Diff');
    expect(boxElementOf(page, `${REPORT}#heading`)).toBeUndefined();
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

const folderIdsOf = (file: string): readonly string[] =>
  file
    .split('/')
    .slice(0, -1)
    .map((_, index, folders) => `folder:${folders.slice(0, index + 1).join('/')}`)
    .reverse();

describe('the Whole project view', () => {
  it('shows every function of the branch graph inside its file frame and its folder frames', async () => {
    const page = await projectPage();
    const { functions } = pageDataOf(html).branchGraph;
    expect(functions.length).toBeGreaterThan(10);
    for (const { id, file } of functions) {
      expect(
        framesAround(page, id).map((frame) => frame.id),
        id,
      ).toEqual([`frame:${file}`, ...folderIdsOf(file)]);
    }
  });

  it('labels a file frame with the name of its file, and a folder frame with the name of its folder', async () => {
    const page = await projectPage();
    expect(framesAround(page, `${RATE}#vatRate`).map((frame) => frame.label)).toEqual([
      'rate.ts',
      'tax/',
      'src/',
    ]);
  });

  it('draws the kept calls between two files as one line with their count', async () => {
    const page = await projectPage();
    const between = linesOf(page).filter(
      ({ from, to }) => fileOf(from) === CART && fileOf(to) === MONEY,
    );
    expect(between.map(({ from, to, label }) => ({ from, to, label }))).toEqual([
      { from: `frame:${CART}`, to: `frame:${MONEY}`, label: '2' },
    ]);
    expect(between[0]?.classes).toContain('bundled');
  });

  it('lists the calls of a bundled line after a click on it, and shows the code of a caller after a click on its call', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    expect(body.queryByRole('region', { name: 'Calls' })).toBeNull();
    fireEvent.click(body.getByRole('button', { name: `2 calls from ${CART} to ${MONEY}` }));
    const calls = within(body.getByRole('region', { name: 'Calls' }));
    expect(calls.getAllByRole('button').map((call) => call.textContent)).toEqual([
      'receipt calls format',
      'subtotal calls round',
    ]);
    fireEvent.click(calls.getByRole('button', { name: 'subtotal calls round' }));
    await settled(page);
    const code = within(body.getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'subtotal' })).toBeDefined();
    expect(boxElementOf(page, `${CART}#subtotal`)?.classList.contains('selected')).toBe(true);
  });

  it('lists the calls of a bundled line after Enter on it', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    fireEvent.keyDown(body.getByRole('button', { name: `2 calls from ${CART} to ${MONEY}` }), {
      key: 'Enter',
    });
    expect(within(body.getByRole('region', { name: 'Calls' })).getAllByRole('button')).toHaveLength(
      2,
    );
  });

  it('keeps a call that the branch added as its own line with its mark', async () => {
    const page = await projectPage();
    const added = linesOf(page).filter(({ from }) => from === `${ALERTS}#alert`);
    expect(added.map(({ to, classes }) => [to, classes.includes('added')])).toEqual(
      expect.arrayContaining([
        [`${NOTIFY}#Mail.send`, true],
        [`${NOTIFY}#Sms.send`, true],
      ]),
    );
  });

  it('marks the boxes as the review marks them, and gives no mark to a function more than one hop from a change', async () => {
    const page = await projectPage();
    const markOf = (id: string): string | undefined =>
      ['added', 'removed', 'changed', 'neighbour'].find((mark) =>
        boxElementOf(page, id)?.classList.contains(mark),
      );
    expect(
      [
        `${ALERTS}#relay`,
        `${ALERTS}#alert`,
        `${CART}#subtotal`,
        `${REPORT}#report`,
        `${MONEY}#round`,
      ].map(markOf),
    ).toEqual(['added', 'changed', 'neighbour', undefined, undefined]);
  });

  it('shows the code and the editor link of a box after a click on it', async () => {
    const page = await projectPage();
    await clickBox(page, `${REPORT}#report`);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'report' })).toBeDefined();
    expect(
      code.getByText('export const report = (title: string): string => `${heading(title)}\\n`;'),
    ).toBeDefined();
    expect(code.getByRole('link', { name: 'Open in VS Code' }).getAttribute('href')).toMatch(
      new RegExp(`/${REPORT}:3$`),
    );
  });

  it('finds a function with the search, selects its box and shows its code, and stays in the view', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    const before = boxesOf(page).length;
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'vat' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `vatRate ${RATE}`,
      }),
    );
    await settled(page);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Whole project');
    expect(boxElementOf(page, `${RATE}#vatRate`)?.classList.contains('selected')).toBe(true);
    expect(
      within(body.getByRole('region', { name: 'Code' })).getByRole('heading', { name: 'vatRate' }),
    ).toBeDefined();
    expect(boxesOf(page)).toHaveLength(before);
  });

  it('shows the functions that the branch removed', async () => {
    const page = await projectPage();
    expect(boxElementOf(page, `${CART}#legacyTotal`)?.classList.contains('removed')).toBe(true);
  });
});

const zoom = (page: LoadedPage, deltaY: number): void => {
  const svg = page.window.document.querySelector('#graph svg');
  if (svg === null) throw new Error('the page draws no SVG');
  fireEvent.wheel(svg, { deltaY, clientX: 100, clientY: 100 });
};

const zoomOut = (page: LoadedPage): void => {
  zoom(page, 1000);
};

const zoomIn = (page: LoadedPage): void => {
  zoom(page, -1000);
};

const smallScreenPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  const graph = page.window.document.getElementById('graph');
  if (graph === null) throw new Error('the page has no graph');
  const screen = { x: 0, y: 0, width: 320, height: 240 };
  graph.getBoundingClientRect = () => ({
    ...screen,
    top: 0,
    left: 0,
    right: screen.width,
    bottom: screen.height,
    toJSON: () => screen,
  });
  return page;
};

const functionBoxesOf = (page: LoadedPage) =>
  boxesOf(page).filter(({ kind }) => kind === 'function');

describe('the zoom levels of the Whole project view', () => {
  it('shows the folder and file frames and no function box at a far zoom', async () => {
    const page = await projectPage();
    zoomOut(page);
    expect(functionBoxesOf(page)).toEqual([]);
    expect(framesOf(page).map(({ id }) => id)).toEqual(
      expect.arrayContaining([`frame:${CART}`, `frame:${RATE}`, 'folder:src', 'folder:src/tax']),
    );
  });

  it('shows the function boxes again at a near zoom', async () => {
    const page = await projectPage();
    const near = functionBoxesOf(page).map(({ id }) => id);
    expect(near).toContain(`${RATE}#vatRate`);
    zoomOut(page);
    zoomIn(page);
    expect(functionBoxesOf(page).map(({ id }) => id)).toEqual(near);
  });

  it('draws the bundled lines between files at every zoom', async () => {
    const page = await projectPage();
    const bundlesOf = () =>
      linesOf(page)
        .filter(({ classes }) => classes.includes('bundled'))
        .map(({ from, to, label, points }) => ({ from, to, label, points }));
    const near = bundlesOf();
    expect(near).toContainEqual(
      expect.objectContaining({ from: `frame:${CART}`, to: `frame:${MONEY}`, label: '2' }),
    );
    zoomOut(page);
    expect(bundlesOf()).toEqual(near);
    zoomIn(page);
    expect(bundlesOf()).toEqual(near);
  });

  it('keeps every frame at its place and lays out nothing again when the zoom changes', async () => {
    const page = await projectPage();
    const graph = page.window.document.getElementById('graph');
    const near = framesOf(page);
    zoomOut(page);
    expect(graph?.getAttribute('aria-busy')).toBe('false');
    expect(framesOf(page)).toEqual(near);
    zoomIn(page);
    expect(graph?.getAttribute('aria-busy')).toBe('false');
    expect(framesOf(page)).toEqual(near);
  });

  it('opens at the zoom that fits the whole project, so a small screen shows folders and files only', async () => {
    const page = await smallScreenPage();
    await openTab(page, 'Whole project');
    expect(functionBoxesOf(page)).toEqual([]);
    expect(framesOf(page).map(({ id }) => id)).toContain(`frame:${CART}`);
  });

  it('zooms in to the box of a function that the search finds at a far zoom', async () => {
    const page = await smallScreenPage();
    await openTab(page, 'Whole project');
    const body = bodyOf(page);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'vat' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `vatRate ${RATE}`,
      }),
    );
    await settled(page);
    expect(boxElementOf(page, `${RATE}#vatRate`)?.classList.contains('selected')).toBe(true);
  });

  it('keeps the function boxes of the Diff view at a far zoom', async () => {
    const page = await loadReaderPage(html);
    zoomOut(page);
    expect(boxElementOf(page, `${CART}#subtotal`)).toBeDefined();
  });
});
