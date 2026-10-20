import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { levelsRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  clickBox,
  loadReaderPage,
  openTab,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const ORDERS = 'src/orders';
const MONEY = 'src/money';
const NOTIFY = 'src/notify';
const CARRIERS = 'src/shipping/carriers';
const RATE = 'src/tax/rate.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(levelsRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const projectPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await openTab(page, 'Whole project');
  return page;
};

const textIn = (page: LoadedPage, id: string, selector: string): string | undefined =>
  boxElementOf(page, id)?.querySelector(selector)?.textContent ?? undefined;

describe('the function count of a level box', () => {
  it('shows the count of the functions that each folder box and file box holds', async () => {
    const page = await projectPage();
    expect(
      [ORDERS, MONEY, NOTIFY, CARRIERS, RATE].map((id) => [id, textIn(page, id, '.functions')]),
    ).toEqual([
      [ORDERS, '5 fn'],
      [MONEY, '2 fn'],
      [NOTIFY, '8 fn'],
      [CARRIERS, '7 fn'],
      [RATE, '1 fn'],
    ]);
  });

  it('leaves the function count out of an outside box', async () => {
    const page = await projectPage();
    await clickBox(page, ORDERS);
    expect(textIn(page, MONEY, '.functions')).toBeUndefined();
    expect(textIn(page, `${ORDERS}/api`, '.functions')).toBe('3 fn');
  });
});

const crumbBarOf = (page: LoadedPage) =>
  within(bodyOf(page).getByRole('region', { name: 'Level summary' }));

const crumbsOf = (page: LoadedPage): readonly string[] =>
  within(crumbBarOf(page).getByRole('navigation', { name: 'Level' }))
    .getAllByRole('button')
    .map((crumb) => crumb.textContent);

describe('the level summary', () => {
  it('shows the count of the boxes and the lines of the open level', async () => {
    const page = await projectPage();
    expect(crumbBarOf(page).getByText(/boxes/).textContent).toBe('5 boxes · 5 lines');
    await clickBox(page, NOTIFY);
    await clickBox(page, `${NOTIFY}/sms.ts`);
    expect(crumbBarOf(page).getByText(/boxes/).textContent).toBe('4 boxes · 2 lines');
  });

  it('opens the parent level with "Up one level"', async () => {
    const page = await projectPage();
    await clickBox(page, ORDERS);
    await clickBox(page, `${ORDERS}/api`);
    expect(crumbsOf(page)).toEqual(['src/', 'orders/', 'api/']);
    fireEvent.click(crumbBarOf(page).getByRole('button', { name: 'Up one level' }));
    await settled(page);
    expect(crumbsOf(page)).toEqual(['src/', 'orders/']);
    expect(boxElementOf(page, `${ORDERS}/api`)).toBeDefined();
  });

  it('turns "Up one level" off on the top level', async () => {
    const page = await projectPage();
    const up = crumbBarOf(page).getByRole('button', { name: 'Up one level' });
    expect(up.hasAttribute('disabled')).toBe(true);
  });
});

describe('the call list of a bundled line', () => {
  it('selects the caller and opens its code after a click on a row', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    const name = `4 calls from ${ORDERS} to ${MONEY}, 1 removed`;
    fireEvent.click(body.getByRole('button', { name }));
    fireEvent.click(within(body.getByRole('dialog', { name })).getByText('book', { exact: false }));
    await settled(page);
    const book = `${ORDERS}/service/book.ts#book`;
    expect(boxElementOf(page, book)?.classList.contains('selected')).toBe(true);
    expect(
      within(body.getByRole('region', { name: 'Code' })).getByRole('heading', { name: 'book' }),
    ).toBeDefined();
    expect(body.queryByRole('dialog')).toBeNull();
  });
});

describe('the counts of a level box', () => {
  it('says "No changes" on a box that holds no change', async () => {
    const page = await projectPage();
    expect(textIn(page, RATE, '.no-changes')).toBe('No changes');
    expect(boxElementOf(page, RATE)?.querySelector('.count')).toBeNull();
    expect(textIn(page, ORDERS, '.no-changes')).toBeUndefined();
  });

  it('puts the name and the words of the counts in the tooltip of the box', async () => {
    const page = await projectPage();
    expect(textIn(page, ORDERS, ':scope > title')).toBe('orders/\n2 changed, 1 added');
    expect(textIn(page, NOTIFY, ':scope > title')).toBe('notify/\n1 added, 1 open end');
    expect(textIn(page, RATE, ':scope > title')).toBe('tax/rate.ts\nNo changes');
  });
});
