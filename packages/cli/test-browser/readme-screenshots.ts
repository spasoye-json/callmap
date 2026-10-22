import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { featureBranchRepoWithUnchangedFiles, levelsRepo } from '../test/fixture-repo.ts';
import { reviewHtmlOf } from '../test/reader-page.ts';
import { chromiumExecutable } from './chromium.ts';

type Fixture = 'levels' | 'review';
type Scheme = 'light' | 'dark';

interface Shot {
  readonly file: string;
  readonly fixture: Fixture;
  readonly view: 'Diff' | 'Whole project';
  readonly level?: string;
  readonly selected?: string;
  readonly leftPanel?: 'collapsed';
}

const SHOTS: readonly Shot[] = [
  {
    file: 'diff-view',
    fixture: 'review',
    view: 'Diff',
    selected: 'src/cart.ts#receipt',
    leftPanel: 'collapsed',
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

const pageFiles = new Map<Fixture, string>();
let browser: Browser | undefined;

const pageFileOf = (repo: string): string => {
  const file = join(tempDir('callmap-screenshots-'), 'review.html');
  writeFileSync(file, reviewHtmlOf(repo));
  return pathToFileURL(file).href;
};

beforeAll(async () => {
  const executablePath = chromiumExecutable();
  pageFiles.set('review', pageFileOf(featureBranchRepoWithUnchangedFiles()));
  pageFiles.set('levels', pageFileOf(levelsRepo()));
  mkdirSync(FOLDER, { recursive: true });
  browser = await chromium.launch({ executablePath });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const settled = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      document.getElementById('graph')?.getAttribute('aria-busy') === 'false' &&
      document.querySelector('[aria-busy="true"]') === null,
  );
};

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Room {
  readonly graph: Rect;
  readonly drawing: Rect;
  readonly band: string;
}

const MARGIN = 24;

const roomOf = (page: Page): Promise<Room> =>
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

const fits = ({ graph, drawing }: Room): boolean =>
  drawing.width + 2 * MARGIN <= graph.width && drawing.height + 2 * MARGIN <= graph.height;

const bringDrawingIntoView = async (page: Page): Promise<void> => {
  let room = await roomOf(page);
  while (!fits(room)) {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    room = await roomOf(page);
    if (room.band !== 'read')
      throw new Error(`the drawing fits only out of the Read band: ${JSON.stringify(room)}`);
  }
  const { graph, drawing } = room;
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
  if (shot.leftPanel === 'collapsed')
    await page.getByRole('button', { name: 'Collapse the left panel', exact: true }).click();
  await bringDrawingIntoView(page);
};

const CASES = SHOTS.flatMap((shot) =>
  SCHEMES.map((scheme) => ({ shot, scheme, name: `${shot.file}-${scheme}.png` })),
);

it.each(CASES)('writes $name', async ({ shot, scheme, name }) => {
  if (browser === undefined) throw new Error('the browser did not start');
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: scheme });
  await page.goto(pageFiles.get(shot.fixture) ?? '');
  await settled(page);
  await openShot(page, shot);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(FOLDER, name) });
  await page.close();
});
