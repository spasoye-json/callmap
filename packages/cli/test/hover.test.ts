import { within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, levelsRepo } from './fixture-repo.ts';
import {
  boxesOf,
  chooseEntry,
  clickBox,
  hoverBox,
  leaveBox,
  linesOf,
  loadReaderPage,
  openTab,
  pickFolder,
  reviewHtmlOf,
} from './reader-page.ts';
import type { DrawnLine, LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const CHECKOUT = 'src/checkout.ts';
const MONEY = 'src/money.ts';
const RECEIPT = `${CART}#receipt`;
const TAXED = `${CART}#taxed`;

let diffHtml = '';
let levelsHtml = '';

beforeAll(() => {
  diffHtml = reviewHtmlOf(featureBranchRepo());
  levelsHtml = reviewHtmlOf(levelsRepo());
}, 240_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const nameOf = ({ from, to }: DrawnLine): string => `${from} -> ${to}`;

const boxesWith = (page: LoadedPage, mark: string): readonly string[] =>
  boxesOf(page)
    .filter(({ classes }) => classes.includes(mark))
    .map(({ id }) => id)
    .sort();

const linesWith = (page: LoadedPage, mark: string): readonly string[] =>
  linesOf(page)
    .filter(({ classes }) => classes.includes(mark))
    .map(nameOf)
    .sort();

const marksOf = (page: LoadedPage) => ({
  selected: boxesWith(page, 'selected'),
  hovered: boxesWith(page, 'hovered'),
  boxes: boxesWith(page, 'connected'),
  lines: linesWith(page, 'connected'),
  fadedBoxes: boxesWith(page, 'faded'),
  fadedLines: linesWith(page, 'faded'),
});

const expectNoHighlight = (page: LoadedPage): void => {
  expect(marksOf(page)).toEqual({
    selected: [],
    hovered: [],
    boxes: [],
    lines: [],
    fadedBoxes: [],
    fadedLines: [],
  });
};

const codePanelOf = (page: LoadedPage) =>
  within(bodyOf(page).getByRole('region', { name: 'Code' }));

describe('the hover highlight in the graph', () => {
  it('keeps the lines of the selected path apart from the lines of the hovered box', async () => {
    const page = await loadReaderPage(diffHtml);
    await clickBox(page, TAXED);
    const selectedPath = linesWith(page, 'selected-path');
    expect(selectedPath).toEqual([`${RECEIPT} -> ${TAXED}`, `${TAXED} -> ${CART}#subtotal`]);

    hoverBox(page, `${CHECKOUT}#checkout`);
    expect(linesWith(page, 'selected-path')).toEqual(selectedPath);
    expect(linesWith(page, 'connected')).toEqual([`${CHECKOUT}#checkout -> ${RECEIPT}`]);
  });

  it('highlights the calls in and out of the box under the pointer and the boxes at their other ends', async () => {
    const page = await loadReaderPage(diffHtml);
    hoverBox(page, RECEIPT);
    expect(boxesWith(page, 'hovered')).toEqual([RECEIPT]);
    expect(boxesWith(page, 'selected')).toEqual([]);
    expect(boxesWith(page, 'connected')).toEqual([
      `${CART}#label`,
      `${CART}#legacyTotal`,
      TAXED,
      `${CHECKOUT}#checkout`,
      `${MONEY}#format`,
    ]);
    expect(linesWith(page, 'connected')).toEqual([
      `${RECEIPT} -> ${CART}#label`,
      `${RECEIPT} -> ${CART}#legacyTotal`,
      `${RECEIPT} -> ${TAXED}`,
      `${RECEIPT} -> ${MONEY}#format`,
      `${CHECKOUT}#checkout -> ${RECEIPT}`,
    ]);
    expect(boxesWith(page, 'faded')).toContain(`${CART}#subtotal`);
  });

  it('lights the same path as a click on the box, and marks the box as hovered, not selected', async () => {
    const hovered = await loadReaderPage(diffHtml);
    hoverBox(hovered, RECEIPT);
    const clicked = await loadReaderPage(diffHtml);
    await clickBox(clicked, RECEIPT);
    expect(marksOf(hovered)).toEqual({ ...marksOf(clicked), selected: [], hovered: [RECEIPT] });
  });

  it('clears the highlight when the pointer leaves the box', async () => {
    const page = await loadReaderPage(diffHtml);
    hoverBox(page, RECEIPT);
    leaveBox(page, RECEIPT);
    expectNoHighlight(page);
  });

  it('shows the highlight of the selected box again when the pointer leaves another box', async () => {
    const page = await loadReaderPage(diffHtml);
    await clickBox(page, RECEIPT);
    const selection = marksOf(page);
    hoverBox(page, TAXED);
    expect(boxesWith(page, 'hovered')).toEqual([TAXED]);
    expect(boxesWith(page, 'selected')).toEqual([RECEIPT]);
    leaveBox(page, TAXED);
    expect(marksOf(page)).toEqual(selection);
  });

  it('does not open the code panel', async () => {
    const page = await loadReaderPage(diffHtml);
    hoverBox(page, RECEIPT);
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
  });

  it('does not change the code panel of the selected box', async () => {
    const page = await loadReaderPage(diffHtml);
    await clickBox(page, RECEIPT);
    hoverBox(page, TAXED);
    expect(codePanelOf(page).getByRole('heading').textContent).toBe('receipt');
  });

  it('highlights the calls of the box under the pointer in the Folder view', async () => {
    const page = await loadReaderPage(diffHtml);
    await openTab(page, 'Folder');
    await pickFolder(page, 'src/');
    hoverBox(page, RECEIPT);
    expect(boxesWith(page, 'hovered')).toEqual([RECEIPT]);
    expect(linesWith(page, 'connected')).toContain(`frame:${CART} -> frame:${MONEY}`);
    expect(boxesWith(page, 'connected')).toContain(`${MONEY}#format`);
  });

  it('highlights the calls of the box under the pointer in the Route view', async () => {
    const page = await loadReaderPage(diffHtml);
    await openTab(page, 'Route');
    await chooseEntry(page, 'checkout');
    hoverBox(page, RECEIPT);
    expect(boxesWith(page, 'hovered')).toEqual([RECEIPT]);
    expect(linesWith(page, 'connected')).toContain(`${CHECKOUT}#checkout -> ${RECEIPT}`);
  });
});

const ORDERS = 'src/orders';
const LEVEL_MONEY = 'src/money';
const NOTIFY = 'src/notify';
const CARRIERS = 'src/shipping/carriers';
const API = 'src/orders/api';
const SERVICE = 'src/orders/service';

const ordersPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(levelsHtml);
  await openTab(page, 'Whole project');
  await clickBox(page, ORDERS);
  return page;
};

const boxIdsOf = (page: LoadedPage): readonly string[] => boxesOf(page).map(({ id }) => id);

describe('the hover highlight on a level of the Whole project view', () => {
  it('highlights the bundled lines of a folder box and the boxes at their other ends, also the outside boxes', async () => {
    const page = await ordersPage();
    hoverBox(page, SERVICE);
    expect(marksOf(page)).toEqual({
      selected: [],
      hovered: [SERVICE],
      boxes: [LEVEL_MONEY, NOTIFY, API, CARRIERS].sort(),
      lines: [
        `${API} -> ${SERVICE}`,
        `${NOTIFY} -> ${SERVICE}`,
        `${SERVICE} -> ${LEVEL_MONEY}`,
        `${SERVICE} -> ${NOTIFY}`,
        `${SERVICE} -> ${CARRIERS}`,
      ].sort(),
      fadedBoxes: [],
      fadedLines: [`${API} -> ${LEVEL_MONEY}`],
    });
  });

  it('highlights the bundled lines of an outside box', async () => {
    const page = await ordersPage();
    hoverBox(page, LEVEL_MONEY);
    expect(marksOf(page)).toEqual({
      selected: [],
      hovered: [LEVEL_MONEY],
      boxes: [API, SERVICE],
      lines: [`${API} -> ${LEVEL_MONEY}`, `${SERVICE} -> ${LEVEL_MONEY}`],
      fadedBoxes: [NOTIFY, CARRIERS],
      fadedLines: [
        `${NOTIFY} -> ${SERVICE}`,
        `${API} -> ${SERVICE}`,
        `${SERVICE} -> ${NOTIFY}`,
        `${SERVICE} -> ${CARRIERS}`,
      ],
    });
  });

  it('does not open the level of the box under the pointer', async () => {
    const page = await ordersPage();
    const before = boxIdsOf(page);
    hoverBox(page, SERVICE);
    expect(boxIdsOf(page)).toEqual(before);
    leaveBox(page, SERVICE);
    expectNoHighlight(page);
  });
});
