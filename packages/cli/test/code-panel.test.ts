import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, fixtureText } from './fixture-repo.ts';
import { clickBox, loadReaderPage, reviewHtmlOf, storedItemsOf } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

const readFunction = async (id: string): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await clickBox(page, id);
  return page;
};

const textsOf = (elements: readonly Element[]): readonly string[] =>
  elements.map((element) => element.textContent);

const editorOf = ({ window }: LoadedPage): Element => {
  const editor = window.document.querySelector('.code-panel .cm-editor');
  if (editor === null) throw new Error('the code panel shows no editor');
  return editor;
};

const changedTextOf = (lines: readonly Element[], mark: string): readonly string[] =>
  lines.map((line) => textsOf([...line.querySelectorAll(mark)]).join(''));

const lineNumbersOf = (page: LoadedPage): readonly string[] =>
  [...editorOf(page).querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .filter((element) => !(element as HTMLElement).style.visibility.includes('hidden'))
    .flatMap((element) => {
      const removed = element.querySelector('.removed-line-numbers');
      return removed === null ? [element.textContent] : textsOf([...removed.children]);
    });

describe('the diff in the code panel', () => {
  it('shows the removed lines of a changed function above the lines that the branch added', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#receipt`));
    expect(textsOf(panel.getAllByRole('deletion'))).toEqual([
      '  const total = legacyTotal(prices);',
      "  return `${label('total')}: ${format(total)}`;",
    ]);
    expect(textsOf(panel.getAllByRole('insertion'))).toEqual([
      '  const total = taxed(prices);',
      '  return format(total);',
    ]);
  });

  it('marks the exact characters that changed inside a changed line, on both sides', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#receipt`));
    expect(changedTextOf(panel.getAllByRole('deletion'), '.cm-deletedText')).toEqual([
      'legacyTotal',
      "`${label('total')}: ${}`",
    ]);
    expect(changedTextOf(panel.getAllByRole('insertion'), '.cm-changedText')).toEqual([
      'taxed',
      '',
    ]);
  });

  it('numbers each line as the file numbers it, the base line for a removed line and the branch line for the others', async () => {
    expect(lineNumbersOf(await readFunction(`${CART}#receipt`))).toEqual([
      '8',
      '11',
      '12',
      '9',
      '10',
      '11',
    ]);
  });

  it('marks a line that the branch only added as added only, so that no part of it shows as a changed part', async () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      CART,
      fixtureText('branch', CART).replace(
        '  return format(total);',
        '  console.log(total);\n  return format(total);',
      ),
    );
    const page = await loadReaderPage(reviewHtmlOf(repo, '--base', 'HEAD~1'));
    await clickBox(page, `${CART}#receipt`);
    const added = codePanelOf(page).getAllByRole('insertion');
    expect(textsOf(added)).toEqual(['  console.log(total);']);
    expect(added[0]?.closest('.cm-line')?.classList.contains('added-only')).toBe(true);
  }, 60_000);

  it('shows every line of an added function as added, with no removed line', async () => {
    const page = await readFunction(`${CART}#taxed`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('deletion')).toEqual([]);
    expect(textsOf(panel.getAllByRole('insertion'))).toEqual([
      'export const taxed = (prices: readonly number[]): number => subtotal(prices) * 1.25;',
    ]);
    expect(lineNumbersOf(page)).toEqual(['6']);
  });

  it('shows every line of a removed function as removed, with the line numbers of the base', async () => {
    const page = await readFunction(`${CART}#legacyTotal`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('insertion')).toEqual([]);
    expect(textsOf(panel.getAllByRole('deletion'))).toEqual([
      'export const legacyTotal = (prices: readonly number[]): number => subtotal(prices) * 1.2;',
    ]);
    expect(lineNumbersOf(page)).toEqual(['6']);
  });

  it('shows the code of a function that the branch did not change with no diff', async () => {
    const page = await readFunction(`${CART}#subtotal`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('insertion')).toEqual([]);
    expect(panel.queryAllByRole('deletion')).toEqual([]);
    expect(panel.getByRole('textbox').textContent).toBe(
      'export const subtotal = (prices: readonly number[]): number =>  round(prices.reduce((sum, price) => sum + price, 0));',
    );
    expect(lineNumbersOf(page)).toEqual(['3', '4']);
  });

  it('highlights the syntax of a TypeScript file', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#subtotal`));
    expect(panel.getByText('export').className).toMatch(/syntax-keyword/);
    expect(panel.getByText('0').className).toMatch(/syntax-literal/);
  });

  it('lets the reader read the code but not change it', async () => {
    const textbox = codePanelOf(await readFunction(`${CART}#receipt`)).getByRole('textbox');
    expect(textbox.getAttribute('aria-readonly')).toBe('true');
    expect(textbox.getAttribute('contenteditable')).toBe('false');
  });
});

describe('the size of the code panel', () => {
  it('starts collapsed, and opens after a click on a box', async () => {
    const page = await loadReaderPage(html);
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
    await clickBox(page, `${CART}#receipt`);
    expect(codePanelOf(page).getByRole('heading', { name: 'receipt' })).toBeDefined();
  });

  it('collapses after a click on its collapse button, and opens again after a click on a box', async () => {
    const page = await readFunction(`${CART}#receipt`);
    fireEvent.click(codePanelOf(page).getByRole('button', { name: 'Collapse the code panel' }));
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
    await clickBox(page, `${CART}#taxed`);
    expect(codePanelOf(page).getByRole('heading', { name: 'taxed' })).toBeDefined();
  });

  it('grows by the distance that the reader drags its left edge to the left, also when the browser gives no localStorage', async () => {
    const page = await readFunction(`${CART}#receipt`);
    const edge = codePanelOf(page).getByRole('separator', { name: 'Width of the code panel' });
    const before = Number(edge.getAttribute('aria-valuenow'));
    fireEvent.pointerDown(edge, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(edge, { clientX: 640, pointerId: 1 });
    fireEvent.pointerUp(edge, { clientX: 640, pointerId: 1 });
    expect(Number(edge.getAttribute('aria-valuenow'))).toBe(before + 60);
    expect(bodyOf(page).getByRole('region', { name: 'Code' }).style.width).toBe(
      `${String(before + 60)}px`,
    );
  });

  it('keeps the width that the reader chose for the next page load', async () => {
    const page = await loadReaderPage(html, {});
    await clickBox(page, `${CART}#receipt`);
    const edge = codePanelOf(page).getByRole('separator', { name: 'Width of the code panel' });
    const before = edge.getAttribute('aria-valuenow');
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    const chosen = edge.getAttribute('aria-valuenow');
    expect(chosen).not.toBe(before);
    const next = await loadReaderPage(html, storedItemsOf(page));
    await clickBox(next, `${CART}#receipt`);
    expect(
      codePanelOf(next)
        .getByRole('separator', { name: 'Width of the code panel' })
        .getAttribute('aria-valuenow'),
    ).toBe(chosen);
  });
});
