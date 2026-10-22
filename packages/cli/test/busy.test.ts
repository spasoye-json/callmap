import { within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { levelsRepo } from './fixture-repo.ts';
import {
  boxesOf,
  loadReaderPage,
  openTab,
  pressBox,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const ORDERS = 'src/orders';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(levelsRepo());
}, 120_000);

const projectPage = async (): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await openTab(page, 'Whole project');
  return page;
};

const busyStateOf = ({ window }: LoadedPage): HTMLElement | null =>
  within(window.document.body).queryByRole('status', { name: /^Laying out/ });

const graphOf = ({ window }: LoadedPage): HTMLElement => {
  const graph = window.document.getElementById('graph');
  if (graph === null) throw new Error('the page holds no graph');
  return graph;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((done) => setTimeout(done, milliseconds));

describe('the busy state of the graph', () => {
  it('does not show for a layout under 150 ms', async () => {
    const page = await projectPage();
    graphOf(page).setAttribute('aria-busy', 'true');
    await wait(100);
    expect(busyStateOf(page)).toBeNull();
    graphOf(page).setAttribute('aria-busy', 'false');
    await wait(100);
    expect(busyStateOf(page)).toBeNull();
  });

  it('shows after 150 ms of layout, and goes away when the layout is ready', async () => {
    const page = await projectPage();
    graphOf(page).setAttribute('aria-busy', 'true');
    await wait(200);
    expect(busyStateOf(page)?.textContent).toMatch(/^Laying out/);
    graphOf(page).setAttribute('aria-busy', 'false');
    await wait(20);
    expect(busyStateOf(page)).toBeNull();
  });

  it('keeps the old level on the screen until the new level is ready', async () => {
    const page = await projectPage();
    const before = boxesOf(page).map(({ id }) => id);
    pressBox(page, ORDERS);
    expect(boxesOf(page).map(({ id }) => id)).toEqual(before);
    await settled(page);
    expect(boxesOf(page).map(({ id }) => id)).not.toEqual(before);
  });
});
