import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { COUNTDOWN, commitFile, countdownRepo, featureBranchRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  callsOf,
  chooseEntry,
  clickBox,
  entryListOf,
  linesOf,
  loadReaderPage,
  openTab,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const ALERTS = 'src/alerts.ts';
const CART = 'src/cart.ts';
const CHECKOUT = 'src/checkout.ts';
const MONEY = 'src/money.ts';
const NOTIFY = 'src/notify.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const routePage = async (from = html): Promise<LoadedPage> => {
  const page = await loadReaderPage(from);
  await openTab(page, 'Route');
  return page;
};

describe('the entry points of the Route view', () => {
  it('lists the entry points that reach a changed function first, then by id', async () => {
    const page = await routePage();
    expect(
      entryListOf(page)
        .getAllByRole('button')
        .map((entry) => entry.textContent),
    ).toEqual([
      'alert src/alerts.ts reaches a change',
      'relay src/alerts.ts reaches a change',
      'checkout src/checkout.ts reaches a change',
      'label src/cart.ts',
      'report src/report.ts',
      'vatRate src/tax/rate.ts',
    ]);
  });

  it('shows the entry points only in the Route view', async () => {
    const page = await loadReaderPage(html);
    expect(bodyOf(page).queryByRole('region', { name: 'Entry points' })).toBeNull();
    await openTab(page, 'Route');
    expect(bodyOf(page).getByRole('region', { name: 'Entry points' })).toBeDefined();
    await openTab(page, 'Diff');
    expect(bodyOf(page).queryByRole('region', { name: 'Entry points' })).toBeNull();
  });
});

const functionIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind }) => kind === 'function')
    .map(({ id }) => id)
    .sort();

const callPairsOf = (page: LoadedPage): readonly string[] =>
  callsOf(page)
    .map(({ from, to }) => `${from} -> ${to}`)
    .sort();

describe('the call tree of an entry point', () => {
  it('draws the call tree of the first entry point when the view opens', async () => {
    const page = await routePage();
    expect(functionIdsOf(page)).toEqual([
      `${ALERTS}#alert`,
      `${MONEY}#format`,
      `${MONEY}#round`,
      `${NOTIFY}#Mail.send`,
      `${NOTIFY}#Sms.send`,
    ]);
    expect(
      entryListOf(page)
        .getAllByRole('button')
        .map((entry) => entry.getAttribute('aria-current')),
    ).toEqual(['true', null, null, null, null, null]);
  });

  it('draws every function that a clicked entry point reaches, each once, and the calls between them', async () => {
    const page = await routePage();
    await chooseEntry(page, 'checkout');
    expect(functionIdsOf(page)).toEqual([
      `${CART}#receipt`,
      `${CART}#subtotal`,
      `${CART}#taxed`,
      `${CHECKOUT}#checkout`,
      `${MONEY}#format`,
      `${MONEY}#round`,
    ]);
    expect(callPairsOf(page)).toEqual([
      `${CART}#receipt -> ${CART}#taxed`,
      `${CART}#receipt -> ${MONEY}#format`,
      `${CART}#subtotal -> ${MONEY}#round`,
      `${CART}#taxed -> ${CART}#subtotal`,
      `${CHECKOUT}#checkout -> ${CART}#receipt`,
      `${MONEY}#format -> ${MONEY}#round`,
    ]);
    expect(entryListOf(page).getByRole('button', { current: true }).textContent).toMatch(
      /^checkout /,
    );
  });

  it('marks the boxes and the calls as the review marks them', async () => {
    const page = await routePage();
    await chooseEntry(page, 'checkout');
    const markOf = (id: string): string | undefined =>
      ['added', 'removed', 'changed', 'neighbour'].find((mark) =>
        boxElementOf(page, id)?.classList.contains(mark),
      );
    expect([`${CART}#receipt`, `${CART}#taxed`, `${MONEY}#format`].map(markOf)).toEqual([
      'changed',
      'added',
      'neighbour',
    ]);
    const added = callsOf(page).find(
      ({ from, to }) => from === `${CART}#receipt` && to === `${CART}#taxed`,
    );
    expect(added?.classes).toContain('added');
  });

  it('shows the open ends and the one-of groups of the tree', async () => {
    const page = await routePage();
    expect(
      callsOf(page)
        .filter(({ from }) => from === `${ALERTS}#alert`)
        .filter(({ classes }) => classes.includes('one-of'))
        .map(({ to, label }) => [to, label]),
    ).toEqual(
      expect.arrayContaining([
        [`${NOTIFY}#Mail.send`, 'one of 2'],
        [`${NOTIFY}#Sms.send`, 'one of 2'],
      ]),
    );
    await chooseEntry(page, 'relay');
    expect(
      linesOf(page).filter(
        ({ from, classes }) => from === `${ALERTS}#relay` && classes.includes('open-end'),
      ),
    ).toHaveLength(1);
  });

  it('shows the code of a box in the tree after a click on it', async () => {
    const page = await routePage();
    await chooseEntry(page, 'checkout');
    await clickBox(page, `${CART}#taxed`);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'taxed' })).toBeDefined();
  });
});

describe('the call tree of an entry point with a cycle', () => {
  let cycleHtml = '';

  beforeAll(() => {
    cycleHtml = reviewHtmlOf(countdownRepo());
  }, 120_000);

  it('ends, shows each function once, and draws the call back as one line', async () => {
    const page = await routePage(cycleHtml);
    await chooseEntry(page, 'countdown');
    expect(functionIdsOf(page)).toEqual([
      `${COUNTDOWN}#countdown`,
      `${COUNTDOWN}#tick`,
      `${COUNTDOWN}#tock`,
    ]);
    expect(callPairsOf(page)).toEqual([
      `${COUNTDOWN}#countdown -> ${COUNTDOWN}#tick`,
      `${COUNTDOWN}#tick -> ${COUNTDOWN}#tock`,
      `${COUNTDOWN}#tock -> ${COUNTDOWN}#tick`,
    ]);
  });
});

const findFunction = async (page: LoadedPage, name: string, file: string): Promise<void> => {
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

describe('the search in the Route view', () => {
  it('opens the first entry point in the list whose tree reaches the function, and selects its box', async () => {
    const page = await routePage();
    expect(boxElementOf(page, `${CART}#taxed`)).toBeUndefined();
    await findFunction(page, 'taxed', CART);
    expect(bodyOf(page).getByRole('tab', { selected: true }).textContent).toBe('Route');
    expect(entryListOf(page).getByRole('button', { current: true }).textContent).toMatch(
      /^checkout /,
    );
    expect(functionIdsOf(page)).toContain(`${CHECKOUT}#checkout`);
    expect(boxElementOf(page, `${CART}#taxed`)?.classList.contains('selected')).toBe(true);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'taxed' })).toBeDefined();
  });

  it('keeps the open entry point when its tree already holds the function', async () => {
    const page = await routePage();
    await findFunction(page, 'round', MONEY);
    expect(entryListOf(page).getByRole('button', { current: true }).textContent).toMatch(/^alert /);
    expect(boxElementOf(page, `${MONEY}#round`)?.classList.contains('selected')).toBe(true);
  });
});

const ECHO = 'src/echo.ts';

describe('the search in the Route view for a function that no entry point reaches', () => {
  let echoHtml = '';

  beforeAll(() => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      ECHO,
      `const ping = (left: number): number => (left > 0 ? pong(left - 1) : 0);

const pong = (left: number): number => ping(left);
`,
    );
    echoHtml = reviewHtmlOf(repo);
  }, 120_000);

  it('draws the call tree of the function itself, and marks no entry point', async () => {
    const page = await routePage(echoHtml);
    await findFunction(page, 'pong', ECHO);
    expect(functionIdsOf(page)).toEqual([`${ECHO}#ping`, `${ECHO}#pong`]);
    expect(boxElementOf(page, `${ECHO}#pong`)?.classList.contains('selected')).toBe(true);
    expect(entryListOf(page).queryByRole('button', { current: true })).toBeNull();
  });
});
