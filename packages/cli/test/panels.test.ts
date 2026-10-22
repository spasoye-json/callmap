import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  loadReaderPage,
  openTab,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const PANEL_WIDTH = 300;
const BOTH_PANELS_CLOSED = 900;

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const leftPanelOf = (page: LoadedPage) =>
  within(bodyOf(page).getByRole('complementary', { name: 'Left panel' }));

const codePanelOf = (page: LoadedPage) =>
  within(bodyOf(page).getByRole('complementary', { name: 'Code panel' }));

const regionNamesOf = (page: LoadedPage, name: string): readonly string[] => {
  const panel = within(bodyOf(page).getByRole('complementary', { name }));
  return [...panel.queryAllByRole('region'), ...panel.queryAllByRole('navigation')].map(
    (element) => element.getAttribute('aria-label') ?? '',
  );
};

const isBefore = (first: Element, second: Element): boolean =>
  (first.compareDocumentPosition(second) & first.DOCUMENT_POSITION_FOLLOWING) !== 0;

const translateOf = (page: LoadedPage): readonly [number, number] => {
  const transform =
    page.window.document.querySelector('.viewport')?.getAttribute('transform') ?? '';
  const [, x = '', scale = ''] =
    /translate\((-?[\d.]+),-?[\d.]+\) scale\(([\d.]+)\)/.exec(transform) ?? [];
  return [Number(x), Number(scale)];
};

describe('the top bar', () => {
  it('shows the product name, and the count of changed functions on the Diff tab, with no branch name', async () => {
    const page = await loadReaderPage(html);
    const banner = bodyOf(page).getByRole('banner');
    const bar = within(banner);
    expect(bar.getByRole('heading', { name: 'Callmap' })).toBeDefined();
    const diff = bar.getByRole('tab', { name: 'Diff' });
    expect(diff.querySelector('.count')?.textContent).toBe('5');
    expect(diff.title).toBe('5 changed functions');
    expect(banner.textContent).not.toMatch(/feature|main/);
  });
});

describe('the search field', () => {
  it('takes the focus when the reader presses the slash key outside a text field', async () => {
    const page = await loadReaderPage(html);
    const { document } = page.window;
    const field = bodyOf(page).getByRole('searchbox', { name: 'Find a function' });
    expect(field.getAttribute('placeholder')).toBe('Find a function');
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(field);
    expect(fireEvent.keyDown(field, { key: '/' })).toBe(true);
  });
});

describe('the two panels beside the graph', () => {
  it('puts the search, the rate, the legend and the view lists in the left panel, and only the code in the right panel', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#receipt`);
    expect(regionNamesOf(page, 'Left panel')).toEqual(
      expect.arrayContaining(['Search', 'Resolution rate', 'Marks']),
    );
    expect(regionNamesOf(page, 'Code panel')).toEqual(['Code']);
    await openTab(page, 'Folder');
    expect(regionNamesOf(page, 'Left panel')).toContain('Folders');
    await openTab(page, 'Route');
    expect(regionNamesOf(page, 'Left panel')).toContain('Entry points');

    const { document } = page.window;
    const left = bodyOf(page).getByRole('complementary', { name: 'Left panel' });
    const code = bodyOf(page).getByRole('complementary', { name: 'Code panel' });
    const graph = document.getElementById('graph');
    if (graph === null) throw new Error('the page holds no graph');
    expect(isBefore(left, graph)).toBe(true);
    expect(isBefore(graph, code)).toBe(true);
  });

  it('collapses and opens the left panel on its own, and leaves the code panel open', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#receipt`);
    fireEvent.click(leftPanelOf(page).getByRole('button', { name: 'Collapse the left panel' }));
    expect(bodyOf(page).queryByRole('region', { name: 'Search' })).toBeNull();
    expect(bodyOf(page).getByRole('region', { name: 'Code' })).toBeDefined();
    fireEvent.click(leftPanelOf(page).getByRole('button', { name: 'Open the left panel' }));
    expect(bodyOf(page).getByRole('region', { name: 'Search' })).toBeDefined();
  });

  it('collapses the code panel on its own, opens it again with its button, and leaves the left panel open', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#receipt`);
    fireEvent.click(codePanelOf(page).getByRole('button', { name: 'Collapse the code panel' }));
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
    expect(bodyOf(page).getByRole('region', { name: 'Search' })).toBeDefined();
    fireEvent.click(codePanelOf(page).getByRole('button', { name: 'Open the code panel' }));
    expect(
      within(bodyOf(page).getByRole('region', { name: 'Code' })).getByRole('heading', {
        name: 'receipt',
      }),
    ).toBeDefined();
  });

  it('grows the left panel by the distance that the reader drags its right edge to the right', async () => {
    const page = await loadReaderPage(html);
    const edge = leftPanelOf(page).getByRole('separator', { name: 'Width of the left panel' });
    const before = Number(edge.getAttribute('aria-valuenow'));
    fireEvent.pointerDown(edge, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(edge, { clientX: 350, pointerId: 1 });
    fireEvent.pointerUp(edge, { clientX: 350, pointerId: 1 });
    expect(Number(edge.getAttribute('aria-valuenow'))).toBe(before + 50);
  });

  it('pans the graph to the selected box when the left panel opens and the graph gets narrower, with no new layout', async () => {
    const page = await loadReaderPage(html);
    const { document } = page.window;
    const graph = document.getElementById('graph');
    if (graph === null) throw new Error('the page holds no graph');
    const isOpen = (name: string): boolean =>
      document.querySelector(`[aria-label="${name}"]`)?.classList.contains('collapsed') === false;
    const visibleWidth = (): number =>
      BOTH_PANELS_CLOSED -
      (isOpen('Left panel') ? PANEL_WIDTH : 0) -
      (isOpen('Code panel') ? PANEL_WIDTH : 0);
    graph.getBoundingClientRect = (): DOMRect => {
      const width = visibleWidth();
      const height = 2000;
      const box = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
      return { ...box, toJSON: () => box };
    };
    fireEvent.click(leftPanelOf(page).getByRole('button', { name: 'Collapse the left panel' }));
    const far = boxesOf(page)
      .filter(({ classes }) => classes.includes('changed'))
      .sort((left, right) => right.x + right.width - (left.x + left.width))[0];
    if (far === undefined) throw new Error('the drawing holds no changed box');
    await clickBox(page, far.id);
    const [beforeX, scale] = translateOf(page);
    expect(beforeX + (far.x + far.width) * scale).toBeGreaterThan(visibleWidth() - PANEL_WIDTH);

    fireEvent.click(leftPanelOf(page).getByRole('button', { name: 'Open the left panel' }));
    await settled(page);

    const [x] = translateOf(page);
    expect(x + far.x * scale).toBeGreaterThanOrEqual(0);
    expect(x + (far.x + far.width) * scale).toBeLessThanOrEqual(visibleWidth());
    const after = boxesOf(page).find(({ id }) => id === far.id);
    expect([after?.x, after?.y]).toEqual([far.x, far.y]);
  });
});
