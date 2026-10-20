import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { boxElementOf, linesOf, loadReaderPage, reviewHtmlOf } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const ADDED = `${CART}#taxed`;
const CHANGED = `${CART}#receipt`;

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const legendOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Marks' }));

const isShown = (page: LoadedPage, element: Element | undefined): boolean => {
  if (element === undefined) throw new Error('the drawing holds no such element');
  return page.window.getComputedStyle(element).display !== 'none';
};

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
});
