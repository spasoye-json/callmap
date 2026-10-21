import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, levelsRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  linesOf,
  loadReaderPage,
  openTab,
  pickFolder,
  reviewHtmlOf,
} from './reader-page.ts';
import type { GraphSize, LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const ADDED = `${CART}#taxed`;
const CHANGED = `${CART}#receipt`;
const RELAY = 'src/alerts.ts#relay';
const OPEN_END = 'open-end:src/alerts.ts#relay:0';

const SMALL: GraphSize = { width: 300, height: 60 };

let html = '';
let levelsHtml = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
  levelsHtml = reviewHtmlOf(levelsRepo());
}, 120_000);

const legendOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Marks' }));

const isShown = (page: LoadedPage, element: Element | undefined): boolean => {
  if (element === undefined) throw new Error('the drawing holds no such element');
  return page.window.getComputedStyle(element).display !== 'none';
};

const MARK_NAMES = ['Changed', 'Added', 'Removed', 'Neighbour'] as const;

const clickMark = (page: LoadedPage, name: string): void => {
  fireEvent.click(legendOf(page).getByRole('button', { name: new RegExp(`^${name} \\d+$`) }));
};

const edgeHintsOf = ({ window }: LoadedPage): readonly string[] =>
  within(window.document.body)
    .queryAllByRole('button', { name: /more box(es)? / })
    .map(({ textContent }) => textContent);

const mapBoxesOf = ({ window }: LoadedPage): readonly string[] =>
  [...window.document.querySelectorAll('.overview-map [data-map-box]')].map(
    (box) => box.getAttribute('data-map-box') ?? '',
  );

const allHiddenOf = ({ window }: LoadedPage): HTMLElement | null =>
  within(window.document.body).queryByRole('status', { name: 'All marks are hidden' });

const declared = ({ window }: LoadedPage, element: Element, property: string): string => {
  let value = '';
  for (const sheet of window.document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof window.CSSStyleRule) || !element.matches(rule.selectorText)) continue;
      value = rule.style.getPropertyValue(property) || value;
    }
  }
  return value;
};

const frameElementOf = ({ window }: LoadedPage, id: string): Element | undefined =>
  [...window.document.querySelectorAll('#graph [data-frame]')].find(
    (element) => element.getAttribute('data-frame') === id,
  );

const lineElementsTo = (page: LoadedPage, id: string): readonly Element[] =>
  [...page.window.document.querySelectorAll('#graph [data-from]')].filter(
    (element) => element.getAttribute('data-to') === id,
  );

describe('the legend of the marks', () => {
  it('counts the functions of each mark and the calls of each kind in the review', async () => {
    const page = await loadReaderPage(html);
    expect(
      legendOf(page)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual(['ΔChanged 2', '+Added 2', '−Removed 1', '·Neighbour 6']);
    const callRows = page.window.document.querySelectorAll('.marks div.legend-row');
    expect([...callRows].map((row) => row.textContent)).toEqual([
      'Added call 5',
      'Removed call 3',
      'One of a group 1',
      'Open end 1',
    ]);
  });

  it('hides the boxes of a mark and their lines after a click on the mark, and shows them after a second click', async () => {
    const page = await loadReaderPage(html);
    const added = legendOf(page).getByRole('button', { name: /^Added \d+$/ });
    expect(lineElementsTo(page, ADDED).length).toBeGreaterThan(0);

    fireEvent.click(added);
    expect(added.getAttribute('aria-pressed')).toBe('true');
    expect(isShown(page, boxElementOf(page, ADDED))).toBe(false);
    expect(lineElementsTo(page, ADDED).every((line) => !isShown(page, line))).toBe(true);
    expect(isShown(page, boxElementOf(page, CHANGED))).toBe(true);

    fireEvent.click(added);
    expect(added.getAttribute('aria-pressed')).toBe('false');
    expect(isShown(page, boxElementOf(page, ADDED))).toBe(true);
    expect(lineElementsTo(page, ADDED).every((line) => isShown(page, line))).toBe(true);
    expect(linesOf(page).length).toBeGreaterThan(0);
  });

  it('hides an open end when every caller of it is hidden', async () => {
    const page = await loadReaderPage(html);
    const added = legendOf(page).getByRole('button', { name: /^Added \d+$/ });

    fireEvent.click(added);
    expect(isShown(page, boxElementOf(page, OPEN_END))).toBe(false);

    fireEvent.click(added);
    expect(isShown(page, boxElementOf(page, OPEN_END))).toBe(true);
  });

  it('hides a frame when every box inside it is hidden', async () => {
    const page = await loadReaderPage(html);
    fireEvent.click(legendOf(page).getByRole('button', { name: /^Added \d+$/ }));
    expect(isShown(page, frameElementOf(page, 'frame:src/alerts.ts'))).toBe(true);

    fireEvent.click(legendOf(page).getByRole('button', { name: /^Changed \d+$/ }));
    expect(isShown(page, frameElementOf(page, 'frame:src/alerts.ts'))).toBe(false);
    expect(isShown(page, frameElementOf(page, `frame:${CART}`))).toBe(true);
  });

  it('hides a folder frame when every frame and box inside it is hidden', async () => {
    const page = await loadReaderPage(levelsHtml);
    await openTab(page, 'Folder');
    await pickFolder(page, 'src/orders/');
    clickMark(page, 'Changed');
    clickMark(page, 'Added');
    expect(isShown(page, frameElementOf(page, 'folder:src/orders/api'))).toBe(true);

    clickMark(page, 'Neighbour');
    expect(isShown(page, frameElementOf(page, 'folder:src/orders/api'))).toBe(false);
    expect(isShown(page, frameElementOf(page, 'folder:src/orders'))).toBe(false);
  });

  it('hides the count of a hidden mark on a level box, and hides the box when every change in it has a hidden mark', async () => {
    const page = await loadReaderPage(levelsHtml);
    await openTab(page, 'Whole project');
    const ORDERS = 'src/orders';
    const countOf = (mark: string): Element | undefined =>
      boxElementOf(page, ORDERS)?.querySelector(`.count[data-mark="${mark}"]`) ?? undefined;

    clickMark(page, 'Changed');
    expect(isShown(page, boxElementOf(page, ORDERS))).toBe(true);
    expect(isShown(page, countOf('changed'))).toBe(false);
    expect(isShown(page, countOf('added'))).toBe(true);
    expect(isShown(page, boxElementOf(page, 'src/shipping/carriers'))).toBe(false);
    expect(
      lineElementsTo(page, 'src/shipping/carriers').every((line) => !isShown(page, line)),
    ).toBe(true);
    expect(isShown(page, boxElementOf(page, 'src/tax/rate.ts'))).toBe(true);

    clickMark(page, 'Added');
    expect(isShown(page, boxElementOf(page, ORDERS))).toBe(false);
    expect(isShown(page, boxElementOf(page, 'src/money'))).toBe(true);

    clickMark(page, 'Changed');
    expect(isShown(page, boxElementOf(page, ORDERS))).toBe(true);
    expect(isShown(page, countOf('changed'))).toBe(true);
    expect(isShown(page, countOf('added'))).toBe(false);
    expect(isShown(page, boxElementOf(page, 'src/shipping/carriers'))).toBe(true);
  });

  it('counts no box past an edge when every mark is hidden', async () => {
    const page = await loadReaderPage(html, undefined, undefined, SMALL);
    expect(edgeHintsOf(page).length).toBeGreaterThan(0);

    for (const name of MARK_NAMES) clickMark(page, name);
    expect(edgeHintsOf(page)).toEqual([]);
  });

  it('draws only the shown boxes on the overview map', async () => {
    const page = await loadReaderPage(html, undefined, undefined, SMALL);
    const hiddenByAdded = [ADDED, RELAY, OPEN_END];
    expect(mapBoxesOf(page)).toEqual(expect.arrayContaining([CHANGED, ...hiddenByAdded]));

    clickMark(page, 'Added');
    expect(mapBoxesOf(page)).toContain(CHANGED);
    expect(mapBoxesOf(page).filter((id) => hiddenByAdded.includes(id))).toEqual([]);

    clickMark(page, 'Added');
    expect(mapBoxesOf(page)).toEqual(expect.arrayContaining([CHANGED, ...hiddenByAdded]));
  });

  it('says that all marks are hidden when every box is hidden, and shows them all again after a click', async () => {
    const page = await loadReaderPage(html);
    const [first, ...rest] = MARK_NAMES;
    clickMark(page, first);
    expect(allHiddenOf(page)).toBeNull();

    for (const name of rest) clickMark(page, name);
    const message = allHiddenOf(page);
    if (message === null) throw new Error('the page says nothing about the hidden marks');
    fireEvent.click(within(message).getByRole('button', { name: 'Show all marks' }));

    expect(allHiddenOf(page)).toBeNull();
    expect(
      legendOf(page)
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-pressed')),
    ).toEqual(['false', 'false', 'false', 'false']);
    expect(isShown(page, boxElementOf(page, ADDED))).toBe(true);
  });

  it('draws the sample of a one-of call dotted, as the graph draws the call', async () => {
    const page = await loadReaderPage(html);
    const sample = page.window.document.querySelector('.marks .sample.one-of');
    const edge = page.window.document.querySelector('#graph .line.one-of > .edge');
    if (sample === null || edge === null) throw new Error('the page draws no one-of call');
    for (const property of ['stroke-dasharray', 'stroke-linecap']) {
      expect(declared(page, sample, property)).not.toBe('');
      expect(declared(page, sample, property)).toBe(declared(page, edge, property));
    }
  });
});
