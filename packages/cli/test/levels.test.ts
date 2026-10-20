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
const TAX = 'src/tax';
const RATE = `${TAX}/rate.ts`;

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
      [RATE]: 'tax/rate.ts',
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
      [CARRIERS]: 'src/shipping/carriers/',
    });
    expect(framesAround(page, API).map(({ label }) => label)).toEqual(['src/orders/']);
    expect(framesAround(page, MONEY)).toEqual([]);
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('outside'))
        .map(({ id }) => id),
    ).toEqual([MONEY, NOTIFY, CARRIERS]);
  });

  it('draws the lines between its boxes and the lines to the outside boxes', async () => {
    const page = await ordersPage();
    expect(lineLabelsOf(page)).toEqual({
      [`${API} -> ${MONEY}`]: '2',
      [`${API} -> ${SERVICE}`]: '2',
      [`${NOTIFY} -> ${SERVICE}`]: '',
      [`${SERVICE} -> ${MONEY}`]: '2',
      [`${SERVICE} -> ${NOTIFY}`]: '',
      [`${SERVICE} -> ${CARRIERS}`]: '',
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

  it('shows a folder with one file as the box of that file', async () => {
    const page = await projectPage();
    expect(boxesOf(page).find(({ id }) => id === RATE)?.kind).toBe('file');
    expect(boxesOf(page).some(({ id }) => id === TAX)).toBe(false);
    await clickBox(page, RATE);
    expect(boxLabelsOf(page)[`${RATE}#taxOf`]).toBe('taxOf');
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/', 'tax/rate.ts']);
  });

  it('opens the level of the outside code after a click on an outside box', async () => {
    const page = await ordersPage();
    await clickBox(page, MONEY);
    expect(boxLabelsOf(page)).toEqual({
      [`${MONEY}/format.ts`]: 'format.ts',
      [`${MONEY}/round.ts`]: 'round.ts',
      [ORDERS]: 'src/orders/',
      [RATE]: 'src/tax/rate.ts',
    });
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/', 'money/']);
  });

  it('collapses an outside box like the box of that path at its parent level', async () => {
    const page = await ordersPage();
    const outsideOf = (shown: LoadedPage): readonly (readonly [string, string])[] =>
      boxesOf(shown)
        .filter(({ classes }) => classes.includes('outside'))
        .map(({ id, label }) => [id, label] as const);
    expect(outsideOf(page)).toEqual([
      [MONEY, 'src/money/'],
      [NOTIFY, 'src/notify/'],
      [CARRIERS, 'src/shipping/carriers/'],
    ]);
    await clickBox(page, CARRIERS);
    expect(Object.keys(boxLabelsOf(page))).toEqual([
      `${CARRIERS}/courier.ts`,
      `${CARRIERS}/post.ts`,
      ORDERS,
    ]);
    await clickBox(page, ORDERS);
    await clickBox(page, MONEY);
    expect(outsideOf(page)).toEqual([
      [ORDERS, 'src/orders/'],
      [RATE, 'src/tax/rate.ts'],
    ]);
    await clickBox(page, RATE);
    expect(Object.keys(boxLabelsOf(page))).toEqual([`${RATE}#taxOf`, MONEY]);
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
    expect(Object.keys(boxLabelsOf(page))).toEqual([MONEY, NOTIFY, ORDERS, CARRIERS, RATE]);
    expect(
      breadcrumbOf(page)
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual(['src/']);
  });
});

describe('the lines of a level', () => {
  it('draws one line from a caller box to a callee box, with the count of their calls from 2 calls', async () => {
    const page = await projectPage();
    expect(lineLabelsOf(page)).toEqual({
      [`${NOTIFY} -> ${ORDERS}`]: '',
      [`${ORDERS} -> ${MONEY}`]: '4',
      [`${ORDERS} -> ${NOTIFY}`]: '',
      [`${ORDERS} -> ${CARRIERS}`]: '',
      [`${RATE} -> ${MONEY}`]: '',
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

const countsOf = (page: LoadedPage, id: string): readonly string[] =>
  [...(boxElementOf(page, id)?.querySelectorAll('.count') ?? [])].map(
    (count) =>
      `${count.querySelector('.chip')?.textContent ?? ''} ${count.getAttribute('data-mark') ?? ''} ${count.getAttribute('data-count') ?? ''}`,
  );

const iconOf = (page: LoadedPage, id: string): string | undefined =>
  boxElementOf(page, id)?.querySelector('.icon')?.getAttribute('data-icon') ?? undefined;

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
      [ORDERS, true, ['Δ changed 2', '+ added 1']],
      [MONEY, true, ['− removed 1']],
      [NOTIFY, true, ['+ added 1', '? open-end 1']],
      [CARRIERS, true, ['Δ changed 1']],
    ]);
  });

  it('names the counts of a box in words, for a screen reader', async () => {
    const page = await projectPage();
    expect(boxElementOf(page, NOTIFY)?.getAttribute('aria-label')).toBe(
      'notify/, 1 added, 1 open end',
    );
  });

  it('shows a folder icon on a folder box and a file icon on a file box', async () => {
    const page = await projectPage();
    expect([iconOf(page, ORDERS), iconOf(page, RATE)]).toEqual(['folder', 'file']);
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
    fireEvent.click(
      body.getByRole('button', { name: `4 calls from ${ORDERS} to ${MONEY}, 1 removed` }),
    );
    const calls = within(body.getByRole('region', { name: 'Calls' }));
    expect(calls.getAllByRole('button').map((call) => call.textContent)).toEqual([
      'book calls round',
      'cancelOrder calls format, removed',
      'placeOrder calls format',
      'refund calls round',
    ]);
    fireEvent.click(
      body.getByRole('button', { name: `1 call from ${ORDERS} to ${NOTIFY}, 1 added` }),
    );
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
  const find = async (page: LoadedPage, name: string, file: string): Promise<void> => {
    const body = bodyOf(page);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: name },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `${name} ${file}`,
      }),
    );
    await settled(page);
  };

  const selectedOf = (page: LoadedPage): readonly string[] =>
    boxesOf(page)
      .filter(({ classes }) => classes.includes('selected'))
      .map(({ id }) => id);

  const crumbsOf = (page: LoadedPage): readonly string[] =>
    breadcrumbOf(page)
      .getAllByRole('button')
      .map((crumb) => crumb.textContent);

  it('opens the level of the file of the function that it finds, and selects its box', async () => {
    const page = await projectPage();
    await find(page, 'refund', `${SERVICE}/refund.ts`);
    expect(boxLabelsOf(page)[`${SERVICE}/refund.ts#refund`]).toBe('refund');
    expect(selectedOf(page)).toEqual([`${SERVICE}/refund.ts#refund`]);
    expect(crumbsOf(page)).toEqual(['src/', 'orders/', 'service/', 'refund.ts']);
    expect(breadcrumbOf(page).getByRole('button', { current: 'location' }).textContent).toBe(
      'refund.ts',
    );
  });

  it('finds a function in another folder from a file level', async () => {
    const page = await channelPage();
    await find(page, 'express', `${CARRIERS}/courier.ts`);
    expect(selectedOf(page)).toEqual([`${CARRIERS}/courier.ts#express`]);
    expect(crumbsOf(page)).toEqual(['src/', 'shipping/carriers/', 'courier.ts']);
  });
});

const CHANNEL = `${NOTIFY}/channel.ts`;

const channelPage = async (): Promise<LoadedPage> => {
  const page = await projectPage();
  await clickBox(page, NOTIFY);
  await clickBox(page, CHANNEL);
  return page;
};

describe('the file level', () => {
  it('opens after a click on a file box, with one box for each function of the file', async () => {
    const page = await channelPage();
    expect(
      boxesOf(page)
        .filter(({ kind }) => kind === 'function')
        .map(({ id, label }) => [id, label]),
    ).toEqual([
      [`${CHANNEL}#Letter.deliver`, 'Letter.deliver'],
      [`${CHANNEL}#Push.deliver`, 'Push.deliver'],
      [`${CHANNEL}#broadcast`, 'broadcast'],
      [`${CHANNEL}#announce`, 'announce'],
      [`${CHANNEL}#urgent`, 'urgent'],
    ]);
    expect(framesAround(page, `${CHANNEL}#broadcast`).map(({ label }) => label)).toEqual([CHANNEL]);
  });

  it('draws each call between 2 functions of the file as its own line, and a call out of the file to an outside box', async () => {
    const page = await channelPage();
    expect(
      linesOf(page)
        .filter(({ classes }) => classes.includes('call'))
        .map(({ from, to }) => `${from} -> ${to}`)
        .sort(),
    ).toEqual([
      `${CHANNEL}#announce -> ${CHANNEL}#broadcast`,
      `${CHANNEL}#announce -> ${NOTIFY}/mail.ts`,
      `${CHANNEL}#broadcast -> ${CHANNEL}#Letter.deliver`,
      `${CHANNEL}#broadcast -> ${CHANNEL}#Push.deliver`,
      `${CHANNEL}#urgent -> ${CHANNEL}#broadcast`,
    ]);
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('outside'))
        .map(({ id, label }) => [id, label]),
    ).toEqual([[`${NOTIFY}/mail.ts`, `${NOTIFY}/mail.ts`]]);
  });

  it('ends the calls from and to the code outside the file at the outside boxes', async () => {
    const page = await ordersPage();
    await clickBox(page, SERVICE);
    await clickBox(page, `${SERVICE}/book.ts`);
    expect(lineLabelsOf(page)).toEqual({
      [`${API} -> ${SERVICE}/book.ts#book`]: '',
      [`${NOTIFY} -> ${SERVICE}/book.ts#book`]: '',
      [`${SERVICE}/book.ts#book -> ${MONEY}`]: '',
      [`${SERVICE}/book.ts#book -> ${NOTIFY}`]: '',
      [`${SERVICE}/book.ts#book -> ${CARRIERS}`]: '',
    });
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('outside'))
        .map(({ id }) => id),
    ).toEqual([MONEY, NOTIFY, API, CARRIERS]);
  });

  it('shows the file at the end of the breadcrumb', async () => {
    const page = await channelPage();
    const crumbs = breadcrumbOf(page).getAllByRole('button');
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['src/', 'notify/', 'channel.ts']);
    expect(crumbs.at(-1)?.getAttribute('aria-current')).toBe('location');
  });

  it('shows the one-of groups of the file', async () => {
    const page = await channelPage();
    const oneOf = linesOf(page).filter(({ classes }) => classes.includes('one-of'));
    expect(oneOf.map(({ to, label }) => [to, label])).toEqual([
      [`${CHANNEL}#Letter.deliver`, 'one of 2'],
      [`${CHANNEL}#Push.deliver`, 'one of 2'],
    ]);
  });

  it('shows the open ends of the file', async () => {
    const page = await projectPage();
    await clickBox(page, NOTIFY);
    await clickBox(page, `${NOTIFY}/sms.ts`);
    const openEnds = boxesOf(page).filter(({ kind }) => kind === 'open-end');
    expect(openEnds.map(({ label }) => label)).toEqual(['JSON.parse(raw).notify :6']);
    expect(
      linesOf(page)
        .filter(({ classes }) => classes.includes('open-end'))
        .map(({ from, to }) => [from, to]),
    ).toEqual([[`${NOTIFY}/sms.ts#relay`, openEnds[0]?.id]]);
  });

  it('shows the code of a function box after a click on it, and highlights its calls', async () => {
    const page = await channelPage();
    const broadcast = `${CHANNEL}#broadcast`;
    await clickBox(page, broadcast);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'broadcast' })).toBeDefined();
    expect(code.getByRole('textbox').textContent).toBe(
      'export const broadcast = (channel: Channel, text: string): string => channel.deliver(text);',
    );
    expect(code.getByRole('link', { name: 'Open in VS Code' }).getAttribute('href')).toMatch(
      new RegExp(`/${CHANNEL}:19$`),
    );
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('selected'))
        .map(({ id }) => id),
    ).toEqual([broadcast]);
    expect(
      linesOf(page)
        .filter(({ classes }) => classes.includes('connected'))
        .map(({ from, to }) => `${from} -> ${to}`)
        .sort(),
    ).toEqual([
      `${CHANNEL}#announce -> ${broadcast}`,
      `${broadcast} -> ${CHANNEL}#Letter.deliver`,
      `${broadcast} -> ${CHANNEL}#Push.deliver`,
      `${CHANNEL}#urgent -> ${broadcast}`,
    ]);
  });
});

const COURIER = `${CARRIERS}/courier.ts`;
const POST = `${CARRIERS}/post.ts`;

const courierPage = async (): Promise<LoadedPage> => {
  const page = await projectPage();
  await clickBox(page, CARRIERS);
  await clickBox(page, COURIER);
  return page;
};

describe('a bundled line on the file level', () => {
  it('lights the outside box at its end when the function at its other end is selected', async () => {
    const page = await courierPage();
    await clickBox(page, `${COURIER}#dispatch`);
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('connected'))
        .map(({ id }) => id),
    ).toEqual([POST]);
  });

  it('keeps the label of a one-of group that ends at an outside box', async () => {
    const page = await courierPage();
    const oneOf = linesOf(page).filter(({ classes }) => classes.includes('one-of'));
    expect(oneOf.map(({ from, to, label }) => [from, to, label])).toEqual([
      [`${COURIER}#dispatch`, POST, 'one of 2'],
    ]);
  });
});

describe('a bundled line with an added call and a removed call', () => {
  it('shows the added mark and the removed mark', async () => {
    const page = await projectPage();
    await clickBox(page, CARRIERS);
    const line = linesOf(page).find(({ from, to }) => from === COURIER && to === POST);
    expect(line?.classes).toEqual(expect.arrayContaining(['added', 'removed']));
    expect(
      bodyOf(page).getByRole('button', {
        name: `5 calls from ${COURIER} to ${POST}, 1 added, 1 removed`,
      }),
    ).toBeDefined();
  });
});
