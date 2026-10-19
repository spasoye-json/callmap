import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { levelsRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  clickBox,
  framesAround,
  linesOf,
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
const API = 'src/orders/api';
const SERVICE = 'src/orders/service';
const SHIPPING = 'src/shipping';

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

const lineLabelsOf = (page: LoadedPage): Readonly<Record<string, string>> =>
  Object.fromEntries(linesOf(page).map(({ from, to, label }) => [`${from} -> ${to}`, label]));

const boxLabelsOf = (page: LoadedPage): Readonly<Record<string, string>> =>
  Object.fromEntries(boxesOf(page).map(({ id, label }) => [id, label]));

describe('the top level of the Whole project view', () => {
  it('shows one box for each top folder of the scope', async () => {
    const page = await projectPage();
    expect(boxLabelsOf(page)).toEqual({
      [MONEY]: 'money/',
      [NOTIFY]: 'notify/',
      [ORDERS]: 'orders/',
      [CARRIERS]: 'shipping/carriers/',
    });
    expect(bodyOf(page).getByRole('tab', { selected: true }).textContent).toBe('Whole project');
  });
});

const ordersPage = async (): Promise<LoadedPage> => {
  const page = await projectPage();
  await clickBox(page, ORDERS);
  return page;
};

const breadcrumbOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('navigation', { name: 'Level' }));

describe('a folder level', () => {
  it('opens after a click on a folder box, with its child folders and the outside boxes', async () => {
    const page = await ordersPage();
    expect(boxLabelsOf(page)).toEqual({
      [API]: 'api/',
      [SERVICE]: 'service/',
      [MONEY]: 'src/money/',
      [NOTIFY]: 'src/notify/',
      [SHIPPING]: 'src/shipping/',
    });
    expect(framesAround(page, API).map(({ label }) => label)).toEqual(['src/orders/']);
    expect(framesAround(page, MONEY)).toEqual([]);
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('outside'))
        .map(({ id }) => id),
    ).toEqual([MONEY, NOTIFY, SHIPPING]);
  });

  it('draws the lines between its boxes and the lines to the outside boxes', async () => {
    const page = await ordersPage();
    expect(lineLabelsOf(page)).toEqual({
      [`${API} -> ${MONEY}`]: '2',
      [`${API} -> ${SERVICE}`]: '2',
      [`${NOTIFY} -> ${SERVICE}`]: '1',
      [`${SERVICE} -> ${MONEY}`]: '2',
      [`${SERVICE} -> ${NOTIFY}`]: '1',
      [`${SERVICE} -> ${SHIPPING}`]: '1',
    });
  });

  it('shows the files of a folder as boxes', async () => {
    const page = await ordersPage();
    await clickBox(page, API);
    expect(boxLabelsOf(page)).toEqual({
      [`${API}/cancel.ts`]: 'cancel.ts',
      [`${API}/place.ts`]: 'place.ts',
      [MONEY]: 'src/money/',
      [SERVICE]: 'src/orders/service/',
    });
  });

  it('opens the last folder of a chain after a click on the box of the chain', async () => {
    const page = await projectPage();
    await clickBox(page, CARRIERS);
    expect(boxLabelsOf(page)).toEqual({
      [`${CARRIERS}/courier.ts`]: 'courier.ts',
      [`${CARRIERS}/post.ts`]: 'post.ts',
      [ORDERS]: 'src/orders/',
    });
  });

  it('opens after Enter on a folder box', async () => {
    const page = await projectPage();
    fireEvent.keyDown(bodyOf(page).getByRole('button', { name: /^orders\// }), { key: 'Enter' });
    await settled(page);
    expect(boxLabelsOf(page)[API]).toBe('api/');
  });
});

describe('the breadcrumb', () => {
  it('shows only in the Whole project view', async () => {
    const page = await loadReaderPage(html);
    expect(bodyOf(page).queryByRole('navigation', { name: 'Level' })).toBeNull();
    await openTab(page, 'Whole project');
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/']);
  });

  it('shows the way from the top level to the open level, and marks the open level', async () => {
    const page = await ordersPage();
    await clickBox(page, API);
    const crumbs = breadcrumbOf(page).getAllByRole('button');
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['src/', 'orders/', 'api/']);
    expect(crumbs.map((crumb) => crumb.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'location',
    ]);
  });

  it('goes back up to a level with one click', async () => {
    const page = await ordersPage();
    await clickBox(page, API);
    fireEvent.click(breadcrumbOf(page).getByRole('button', { name: 'src/' }));
    await settled(page);
    expect(Object.keys(boxLabelsOf(page))).toEqual([MONEY, NOTIFY, ORDERS, CARRIERS]);
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/']);
  });
});

describe('the lines of a level', () => {
  it('draws one line from a caller box to a callee box with the count of their calls', async () => {
    const page = await projectPage();
    expect(lineLabelsOf(page)).toEqual({
      [`${NOTIFY} -> ${ORDERS}`]: '1',
      [`${ORDERS} -> ${MONEY}`]: '4',
      [`${ORDERS} -> ${NOTIFY}`]: '1',
      [`${ORDERS} -> ${CARRIERS}`]: '1',
    });
  });

  it('draws 2 lines between 2 boxes that call each other', async () => {
    const page = await projectPage();
    const between = linesOf(page).filter(
      ({ from, to }) => [from, to].includes(ORDERS) && [from, to].includes(NOTIFY),
    );
    expect(between.map(({ from, to }) => `${from} -> ${to}`).sort()).toEqual([
      `${NOTIFY} -> ${ORDERS}`,
      `${ORDERS} -> ${NOTIFY}`,
    ]);
  });
});

const countsOf = (page: LoadedPage, id: string): string | undefined =>
  boxElementOf(page, id)?.querySelector('.counts')?.textContent ?? undefined;

const hasClass = (page: LoadedPage, id: string, name: string): boolean =>
  boxElementOf(page, id)?.classList.contains(name) ?? false;

describe('the marks of a level', () => {
  it('gives the change mark and the counts to a box that holds a changed function', async () => {
    const page = await projectPage();
    expect(
      [ORDERS, MONEY, NOTIFY, CARRIERS].map((id) => [
        id,
        hasClass(page, id, 'changed'),
        countsOf(page, id),
      ]),
    ).toEqual([
      [ORDERS, true, '2 changed, 1 added'],
      [MONEY, true, '1 removed'],
      [NOTIFY, true, '1 added, 1 open end'],
      [CARRIERS, false, undefined],
    ]);
  });

  it('gives the added mark or the removed mark to a line that holds an added or a removed call', async () => {
    const page = await projectPage();
    const marksOf = (from: string, to: string): readonly string[] =>
      ['kept', 'added', 'removed'].filter((mark) =>
        linesOf(page).some(
          (line) => line.from === from && line.to === to && line.classes.includes(mark),
        ),
      );
    expect(marksOf(ORDERS, NOTIFY)).toEqual(['added']);
    expect(marksOf(ORDERS, MONEY)).toEqual(['kept', 'removed']);
    expect(marksOf(NOTIFY, ORDERS)).toEqual(['kept']);
  });

  it('lists the calls of a line with their marks after a click on it', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    fireEvent.click(body.getByRole('button', { name: `4 calls from ${ORDERS} to ${MONEY}` }));
    const calls = within(body.getByRole('region', { name: 'Calls' }));
    expect(calls.getAllByRole('button').map((call) => call.textContent)).toEqual([
      'book calls round',
      'cancelOrder calls format, removed',
      'placeOrder calls format',
      'refund calls round',
    ]);
    fireEvent.click(body.getByRole('button', { name: `1 call from ${ORDERS} to ${NOTIFY}` }));
    expect(calls.getAllByRole('button').map((call) => call.textContent)).toEqual([
      'book calls confirm, added',
    ]);
  });
});

describe('the layout of a level', () => {
  it('draws the top level from the page data with no layout in the page', async () => {
    const page = await projectPage();
    expect(boxesOf(page).length).toBeGreaterThan(0);
    expect(page.layouts).toEqual([]);
  });

  it('lays out another level once, and not again on a second visit', async () => {
    const page = await ordersPage();
    expect(page.layouts).toHaveLength(1);
    await clickBox(page, API);
    const firstVisit = boxesOf(page);
    expect(page.layouts).toHaveLength(2);
    fireEvent.click(breadcrumbOf(page).getByRole('button', { name: 'src/' }));
    await settled(page);
    await clickBox(page, ORDERS);
    await clickBox(page, API);
    expect(page.layouts).toHaveLength(2);
    expect(boxesOf(page)).toEqual(firstVisit);
  });
});

describe('the page of a review with levels', () => {
  it('is byte-identical for two runs on the same commits', () => {
    const repo = levelsRepo();
    expect(reviewHtmlOf(repo)).toBe(reviewHtmlOf(repo));
  }, 60_000);
});

describe('the search in the Whole project view', () => {
  it('opens the level that holds the file of the function that it finds', async () => {
    const page = await projectPage();
    const body = bodyOf(page);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'refund' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `refund ${SERVICE}/refund.ts`,
      }),
    );
    await settled(page);
    expect(boxLabelsOf(page)[`${SERVICE}/refund.ts`]).toBe('refund.ts');
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/', 'orders/', 'service/']);
  });
});
