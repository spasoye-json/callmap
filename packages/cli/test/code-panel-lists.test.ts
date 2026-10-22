import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { boxesOf, clickBox, loadReaderPage, reviewHtmlOf, settled } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const ALERTS = 'src/alerts.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

const rowsOf = (page: LoadedPage, list: string): readonly string[] =>
  within(codePanelOf(page).getByRole('list', { name: list }))
    .getAllByRole('listitem')
    .map((item) => {
      const chip = item.querySelector('.chip')?.getAttribute('data-mark') ?? 'no chip';
      const text = [...item.querySelectorAll('.name, .note')].map((part) => part.textContent);
      return [chip, ...text].join(' ');
    });

const readFunction = async (id: string): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await clickBox(page, id);
  await settled(page);
  return page;
};

describe('the callers and the callees in the code panel', () => {
  it('lists the callers and the callees of the function with the mark of each and the kind of each call', async () => {
    const page = await readFunction(`${CART}#receipt`);
    expect(rowsOf(page, 'Called by · 1')).toEqual(['neighbour checkout']);
    expect(rowsOf(page, 'Calls · 4')).toEqual([
      'neighbour format',
      'neighbour label removed call',
      'removed legacyTotal removed call',
      'added taxed added call',
    ]);
  });

  it('lists the one-of calls and the open ends of the function', async () => {
    expect(rowsOf(await readFunction(`${ALERTS}#alert`), 'Calls · 3')).toEqual([
      'neighbour Mail.send added call one of 2',
      'neighbour Sms.send added call one of 2',
      'neighbour format added call',
    ]);
    expect(rowsOf(await readFunction(`${ALERTS}#relay`), 'Calls · 1')).toEqual([
      'open-end JSON.parse(raw).notify open end',
    ]);
  });

  it('selects a function after a click on its row', async () => {
    const page = await readFunction(`${CART}#receipt`);
    fireEvent.click(codePanelOf(page).getByRole('button', { name: 'taxed added call' }));
    await settled(page);
    expect(codePanelOf(page).getByRole('heading', { name: 'taxed' })).toBeDefined();
    expect(
      boxesOf(page)
        .filter(({ classes }) => classes.includes('selected'))
        .map(({ id }) => id),
    ).toEqual([`${CART}#taxed`]);
  });
});
