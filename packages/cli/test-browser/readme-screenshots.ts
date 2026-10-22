import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { beforeAll, it } from 'vitest';
import { featureBranchRepoWithUnchangedFiles, levelsRepo } from '../test/fixture-repo.ts';
import { readerPagesOf, settled } from './problems.ts';

type Fixture = 'levels' | 'review';
type Scheme = 'light' | 'dark';

interface Shot {
  readonly file: string;
  readonly fixture: Fixture;
  readonly view: 'Diff' | 'Whole project';
  readonly level?: string;
  readonly selected?: string;
  readonly collapsesLeftPanel?: boolean;
}

const SHOTS: readonly Shot[] = [
  {
    file: 'diff-view',
    fixture: 'review',
    view: 'Diff',
    selected: 'src/cart.ts#receipt',
    collapsesLeftPanel: true,
  },
  { file: 'whole-project-top-level', fixture: 'levels', view: 'Whole project' },
  {
    file: 'whole-project-src-orders',
    fixture: 'levels',
    view: 'Whole project',
    level: 'src/orders',
  },
];

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const VIEWPORT = { width: 1600, height: 1000 };
const FOLDER = fileURLToPath(new URL('../../../docs/screenshots', import.meta.url));

const readerPageOf = readerPagesOf<Fixture>({
  review: featureBranchRepoWithUnchangedFiles,
  levels: levelsRepo,
});

beforeAll(() => {
  mkdirSync(FOLDER, { recursive: true });
});

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface GraphFit {
  readonly graph: Rect;
  readonly drawing: Rect;
  readonly band: string;
}

const MARGIN = 24;

const graphFitOf = (page: Page): Promise<GraphFit> =>
  page.evaluate(() => {
    const rectOf = (selector: string): Rect => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (rect === undefined) throw new Error(`the page has no ${selector}`);
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    const parts = [
      ...document.querySelectorAll('#graph .box, #graph .frame, #graph [data-from], #graph .label'),
    ]
      .map((part) => part.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);
    const left = Math.min(...parts.map((rect) => rect.left));
    const top = Math.min(...parts.map((rect) => rect.top));
    return {
      graph: rectOf('#graph'),
      drawing: {
        left,
        top,
        width: Math.max(...parts.map((rect) => rect.right)) - left,
        height: Math.max(...parts.map((rect) => rect.bottom)) - top,
      },
      band: document.querySelector('#graph .drawing')?.getAttribute('data-band') ?? '',
    };
  });

const fits = ({ graph, drawing }: GraphFit): boolean =>
  drawing.width + 2 * MARGIN <= graph.width && drawing.height + 2 * MARGIN <= graph.height;

const bringDrawingIntoView = async (page: Page): Promise<void> => {
  let graphFit = await graphFitOf(page);
  while (!fits(graphFit)) {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    graphFit = await graphFitOf(page);
    if (graphFit.band !== 'read')
      throw new Error(`the drawing fits only out of the Read band: ${JSON.stringify(graphFit)}`);
  }
  const { graph, drawing } = graphFit;
  const dx = graph.left + (graph.width - drawing.width) / 2 - drawing.left;
  const dy = graph.top + (graph.height - drawing.height) / 2 - drawing.top;
  const x = graph.left + MARGIN / 2;
  const y = graph.top + graph.height - MARGIN / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
};

const openShot = async (page: Page, shot: Shot): Promise<void> => {
  await page.getByRole('tab', { name: shot.view, exact: true }).click();
  await settled(page);
  for (const box of [shot.level, shot.selected]) {
    if (box === undefined) continue;
    await page.locator(`#graph .box[data-box="${box}"]`).click();
    await settled(page);
  }
  if (shot.collapsesLeftPanel)
    await page.getByRole('button', { name: 'Collapse the left panel', exact: true }).click();
  await bringDrawingIntoView(page);
};

const CASES = SHOTS.flatMap((shot) =>
  SCHEMES.map((scheme) => ({ shot, scheme, name: `${shot.file}-${scheme}.png` })),
);

it.each(CASES)('writes $name', async ({ shot, scheme, name }) => {
  const page = await readerPageOf(shot.fixture, { viewport: VIEWPORT, colorScheme: scheme });
  await openShot(page, shot);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(FOLDER, name) });
  await page.close();
});
