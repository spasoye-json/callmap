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
}

const SHOTS: readonly Shot[] = [
  { file: 'diff-view', fixture: 'review', view: 'Diff', selected: 'src/cart.ts#receipt' },
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

const openShot = async (page: Page, shot: Shot): Promise<void> => {
  await page.getByRole('tab', { name: shot.view, exact: true }).click();
  await settled(page);
  for (const box of [shot.level, shot.selected]) {
    if (box === undefined) continue;
    await page.locator(`#graph .box[data-box="${box}"]`).click();
    await settled(page);
  }
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
