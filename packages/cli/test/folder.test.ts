import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepoWithUnchangedFiles } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  callsOf,
  clickBox,
  framesAround,
  loadReaderPage,
  linesOf,
  openTab,
  pickFolder,
  runCallmap,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const VAT = 'src/tax/vat.ts';
const RATE = 'src/tax/rate.ts';
const INVOICE = 'src/invoice.ts';
const PERCENT = 'src/percent.ts';

let html = '';

beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
  const finished = runCallmap([
    'review',
    featureBranchRepoWithUnchangedFiles(),
    '--no-open',
    '--out',
    out,
  ]);
  expect(finished.status, finished.stderr).toBe(0);
  html = readFileSync(out, 'utf8');
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const folderPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await openTab(page, 'Folder');
  return page;
};

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';

describe('the folder tree', () => {
  it('shows only in the Folder view', async () => {
    const page = await loadReaderPage(html);
    const body = bodyOf(page);
    expect(body.queryByRole('navigation', { name: 'Folders' })).toBeNull();
    await openTab(page, 'Folder');
    expect(body.getByRole('navigation', { name: 'Folders' })).toBeDefined();
    await openTab(page, 'Whole project');
    expect(body.queryByRole('navigation', { name: 'Folders' })).toBeNull();
  });

  it('marks the folder that the view draws', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/ledger/');
    await pickFolder(page, 'src/tax/');
    const tree = within(bodyOf(page).getByRole('navigation', { name: 'Folders' }));
    expect(
      tree
        .getAllByRole('button')
        .filter((folder) => folder.getAttribute('aria-current') === 'true')
        .map((folder) => folder.getAttribute('aria-label')),
    ).toEqual(['src/tax/']);
  });

  it('lists every folder that holds a function in scope, sorted by path', async () => {
    const tree = within(bodyOf(await folderPage()).getByRole('navigation', { name: 'Folders' }));
    expect(tree.getAllByRole('button').map((folder) => folder.getAttribute('aria-label'))).toEqual([
      'src/',
      'src/ledger/',
      'src/tax/',
    ]);
  });
});

const functionIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind }) => kind === 'function')
    .map(({ id }) => id)
    .sort();

describe('the Folder view', () => {
  it('draws the functions of a folder and the calls between them after a click on the folder', async () => {
    const page = await folderPage();
    expect(boxesOf(page)).toEqual([]);
    await pickFolder(page, 'src/tax/');
    expect(functionIdsOf(page)).toEqual(expect.arrayContaining([`${RATE}#vatRate`, `${VAT}#vat`]));
    expect(callsOf(page).map(({ from, to }) => `${from} -> ${to}`)).toContain(
      `${VAT}#vat -> ${RATE}#vatRate`,
    );
    expect(framesAround(page, `${VAT}#vat`).map((frame) => frame.label)).toEqual([
      'vat.ts',
      'tax/',
      'src/',
    ]);
  });

  it('shows the callers and callees one hop out of the folder as outside functions, and no function two hops out', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    expect(functionIdsOf(page)).toEqual(
      [`${INVOICE}#invoice`, `${PERCENT}#percent`, `${RATE}#vatRate`, `${VAT}#vat`].sort(),
    );
    for (const id of [`${INVOICE}#invoice`, `${PERCENT}#percent`]) {
      expect(boxElementOf(page, id)?.classList.contains('outside'), id).toBe(true);
    }
    for (const id of [`${RATE}#vatRate`, `${VAT}#vat`]) {
      expect(boxElementOf(page, id)?.classList.contains('outside'), id).toBe(false);
    }
    expect(boxElementOf(page, `${INVOICE}#bill`)).toBeUndefined();
    expect(boxElementOf(page, `${PERCENT}#hundredth`)).toBeUndefined();
  });

  it('gives an outside function the neighbour mark only when it is one hop from a changed function', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    for (const id of [`${INVOICE}#invoice`, `${PERCENT}#percent`]) {
      expect(boxElementOf(page, id)?.classList.contains('neighbour'), id).toBe(false);
    }
  });

  it('draws no call between two outside functions', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    fireEvent.input(bodyOf(page).getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'bill' },
    });
    fireEvent.click(
      within(bodyOf(page).getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `bill ${INVOICE}`,
      }),
    );
    await settled(page);
    expect(boxElementOf(page, `${INVOICE}#bill`)).toBeDefined();
    expect(callsOf(page).map(({ from, to }) => `${from} -> ${to}`)).not.toContain(
      `${INVOICE}#bill -> ${INVOICE}#invoice`,
    );
  });

  it('draws only the new folder after a click on another folder', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    await pickFolder(page, 'src/ledger/');
    expect(functionIdsOf(page)).toEqual(['src/ledger/entry.ts#entry']);
  });

  it('bundles the kept calls between two files', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/');
    const between = linesOf(page).filter(
      ({ from, to }) => from === `frame:${CART}` && to === `frame:${MONEY}`,
    );
    expect(between.map(({ label, classes }) => [label, classes.includes('bundled')])).toEqual([
      ['2', true],
    ]);
  });

  it('marks the boxes as the review marks them', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/');
    expect(boxElementOf(page, `${CART}#taxed`)?.classList.contains('added')).toBe(true);
    expect(boxElementOf(page, `${CART}#legacyTotal`)?.classList.contains('removed')).toBe(true);
  });

  it('shows the code and the editor link of a box after a click on it', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    await clickBox(page, `${VAT}#vat`);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'vat' })).toBeDefined();
    expect(code.getByRole('link', { name: 'Open in VS Code' }).getAttribute('href')).toMatch(
      new RegExp(`/${VAT}:4$`),
    );
  });

  it('opens no next hop after a click on an outside function, and selects it and shows its code', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    await clickBox(page, `${PERCENT}#percent`);
    expect(boxElementOf(page, `${PERCENT}#hundredth`)).toBeUndefined();
    expect(boxElementOf(page, `${PERCENT}#percent`)?.classList.contains('selected')).toBe(true);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('heading', { name: 'percent' })).toBeDefined();
  });

  it('finds a function with the search, draws its box and stays in the view', async () => {
    const page = await folderPage();
    await pickFolder(page, 'src/tax/');
    const body = bodyOf(page);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'bill' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `bill ${INVOICE}`,
      }),
    );
    await settled(page);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Folder');
    expect(boxElementOf(page, `${INVOICE}#bill`)?.classList.contains('selected')).toBe(true);
  });
});
