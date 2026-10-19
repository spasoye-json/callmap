import { fireEvent } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  chooseEntry,
  clickBox,
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

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

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

const touches = ({ from, to }: DrawnLine, id: string): boolean => from === id || to === id;

const expectEveryOtherBoxAndLineFaded = (page: LoadedPage): void => {
  for (const box of boxesOf(page)) {
    const lit = box.classes.includes('selected') || box.classes.includes('connected');
    expect(box.classes.includes('faded'), box.id).toBe(!lit);
  }
  for (const line of linesOf(page)) {
    expect(line.classes.includes('faded'), nameOf(line)).toBe(!line.classes.includes('connected'));
  }
};

const expectHighlightAround = (page: LoadedPage, id: string): void => {
  expect(boxesWith(page, 'selected')).toEqual([id]);
  const touching = linesOf(page).filter(
    (line) => !line.classes.includes('bundled') && touches(line, id),
  );
  expect(touching.length).toBeGreaterThan(0);
  for (const line of touching) {
    expect(line.classes, nameOf(line)).toContain('connected');
    const other = line.from === id ? line.to : line.from;
    expect(boxesWith(page, 'connected'), nameOf(line)).toContain(other);
  }
  expectEveryOtherBoxAndLineFaded(page);
};

const expectNoHighlight = (page: LoadedPage): void => {
  for (const mark of ['selected', 'connected', 'faded']) {
    expect(boxesWith(page, mark), mark).toEqual([]);
    expect(linesWith(page, mark), mark).toEqual([]);
  }
};

describe('the selection in the graph', () => {
  it('highlights the calls in and out of the clicked function and the boxes at their other ends, and fades the rest', async () => {
    const page = await loadReaderPage(html);
    expectNoHighlight(page);
    await clickBox(page, RECEIPT);
    expect(boxesWith(page, 'selected')).toEqual([RECEIPT]);
    expect(boxesWith(page, 'connected')).toEqual([
      `${CART}#label`,
      `${CART}#legacyTotal`,
      `${CART}#taxed`,
      `${CHECKOUT}#checkout`,
      `${MONEY}#format`,
    ]);
    expect(linesWith(page, 'connected')).toEqual([
      `${RECEIPT} -> ${CART}#label`,
      `${RECEIPT} -> ${CART}#legacyTotal`,
      `${RECEIPT} -> ${CART}#taxed`,
      `${RECEIPT} -> ${MONEY}#format`,
      `${CHECKOUT}#checkout -> ${RECEIPT}`,
    ]);
    expect(boxesWith(page, 'faded')).toContain(`${CART}#subtotal`);
    expect(linesWith(page, 'faded')).toContain(`${CART}#taxed -> ${CART}#subtotal`);
    expectEveryOtherBoxAndLineFaded(page);
  });

  it('highlights a bundled line that holds a call of the selected function in the Whole project view', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Whole project');
    await clickBox(page, RECEIPT);
    expect(linesWith(page, 'connected')).toContain(`frame:${CART} -> frame:${MONEY}`);
    expect(boxesWith(page, 'connected')).toContain(`${MONEY}#format`);
    expect(boxesWith(page, 'faded')).toContain(`${MONEY}#round`);
    expectHighlightAround(page, RECEIPT);
  });

  it('highlights the calls of the selected function in the Folder view', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Folder');
    await pickFolder(page, 'src/');
    await clickBox(page, RECEIPT);
    expectHighlightAround(page, RECEIPT);
  });

  it('highlights the calls of the selected function in the Route view', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Route');
    await chooseEntry(page, 'checkout');
    await clickBox(page, RECEIPT);
    expectHighlightAround(page, RECEIPT);
  });

  it('keeps the selection when the reader changes the view', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, RECEIPT);
    await openTab(page, 'Whole project');
    expectHighlightAround(page, RECEIPT);
  });

  it('clears the highlight after a click on the empty graph', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, RECEIPT);
    const drawing = page.window.document.querySelector('#graph svg');
    drawing?.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }));
    expectNoHighlight(page);
  });

  it('clears the highlight after the Escape key', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, RECEIPT);
    fireEvent.keyDown(page.window.document.body, { key: 'Escape' });
    expectNoHighlight(page);
  });
});
