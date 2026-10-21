import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import {
  featureBranchRepoWithUnchangedFiles,
  levelsRepo,
  longNamesRepo,
} from '../test/fixture-repo.ts';
import { reviewHtmlOf } from '../test/reader-page.ts';
import { chromiumExecutable } from './chromium.ts';
import { problemsOnPage } from './problems.ts';

type Fixture = 'levels' | 'review' | 'long names';
type Scheme = 'light' | 'dark';

interface Look {
  readonly fixture: Fixture;
  readonly view: 'Diff' | 'Folder' | 'Whole project';
  readonly folder?: string;
  readonly level?: string;
}

const LONG_FOLDER = 'src/settlement_reconciliation_adjustments';

const LOOKS: readonly Look[] = [
  { fixture: 'levels', view: 'Diff' },
  { fixture: 'levels', view: 'Folder', folder: 'src/orders/' },
  { fixture: 'levels', view: 'Whole project' },
  { fixture: 'levels', view: 'Whole project', level: 'src/orders' },
  { fixture: 'review', view: 'Diff' },
  { fixture: 'review', view: 'Folder', folder: 'src/tax/' },
  { fixture: 'review', view: 'Whole project' },
  { fixture: 'long names', view: 'Diff' },
  { fixture: 'long names', view: 'Folder', folder: `${LONG_FOLDER}/` },
  { fixture: 'long names', view: 'Whole project' },
  { fixture: 'long names', view: 'Whole project', level: LONG_FOLDER },
];

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const BANDS = ['read', 'scan', 'map'];
const MOST_ZOOM_STEPS = 20;

const pageFiles = new Map<Fixture, string>();
let browser: Browser | undefined;

const pageFileOf = (repo: string): string => {
  const file = join(tempDir('callmap-browser-'), 'review.html');
  writeFileSync(file, reviewHtmlOf(repo));
  return pathToFileURL(file).href;
};

beforeAll(async () => {
  const executablePath = chromiumExecutable();
  pageFiles.set('levels', pageFileOf(levelsRepo()));
  pageFiles.set('review', pageFileOf(featureBranchRepoWithUnchangedFiles()));
  pageFiles.set('long names', pageFileOf(longNamesRepo()));
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

const openLook = async (page: Page, look: Look): Promise<void> => {
  await page.getByRole('tab', { name: look.view, exact: true }).click();
  await settled(page);
  if (look.folder !== undefined) {
    await page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('button', { name: look.folder, exact: true })
      .click();
    await settled(page);
  }
  if (look.level !== undefined) {
    await page.locator(`#graph .box.level[data-box="${look.level}"]`).click();
    await settled(page);
  }
};

const bandOf = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('#graph .drawing')?.getAttribute('data-band') ?? '');

const nameOf = ({ fixture, view, folder, level }: Look): string =>
  [`${view} view of the ${fixture} fixture`, folder ?? level].filter(Boolean).join(' at ');

const CASES = LOOKS.flatMap((look) =>
  SCHEMES.map((scheme) => ({ look, scheme, name: `${nameOf(look)} in ${scheme} mode` })),
);

describe('the labels of the reader page in Chromium', () => {
  it.each(CASES)('stay inside their boxes and frames in the $name', async ({ look, scheme }) => {
    if (browser === undefined) throw new Error('the browser did not start');
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      colorScheme: scheme,
    });
    await page.goto(pageFiles.get(look.fixture) ?? '');
    await settled(page);
    await openLook(page, look);
    const bands = new Set<string>();
    const problems: string[] = [];
    for (let step = 0; step < MOST_ZOOM_STEPS; step++) {
      const band = await bandOf(page);
      bands.add(band);
      problems.push(
        ...(await page.evaluate(problemsOnPage)).map((problem) => `${band}: ${problem}`),
      );
      if (band === 'map') break;
      await page.getByRole('button', { name: 'Zoom out' }).click();
    }
    await page.close();
    expect(problems).toEqual([]);
    expect([...bands]).toEqual(BANDS);
  });
});
