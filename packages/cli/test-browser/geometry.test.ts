import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  featureBranchRepoWithUnchangedFiles,
  levelsRepo,
  longNamesRepo,
} from '../test/fixture-repo.ts';
import { hintsOverBoxes, mapBandProblems, problemsOnPage, zoomLabelRoom } from './problems.ts';
import { readerPagesOf, settled } from './reader-pages.ts';

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

const readerPageOf = readerPagesOf<Fixture>({
  levels: levelsRepo,
  review: featureBranchRepoWithUnchangedFiles,
  'long names': longNamesRepo,
});

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

const WIDE = { width: 1600, height: 1000 };
const NARROW = { width: 900, height: 560 };

const openPage = async (
  look: Look,
  scheme: Scheme,
  viewport: { readonly width: number; readonly height: number } = WIDE,
): Promise<Page> => {
  const page = await readerPageOf(look.fixture, { viewport, colorScheme: scheme });
  await openLook(page, look);
  return page;
};

const zoomOutTo = async (page: Page, band: string): Promise<void> => {
  for (let step = 0; step < MOST_ZOOM_STEPS && (await bandOf(page)) !== band; step++)
    await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(await bandOf(page)).toBe(band);
};

describe('the labels of the reader page in Chromium', () => {
  it.each(CASES)('stay inside their boxes and frames in the $name', async ({ look, scheme }) => {
    const page = await openPage(look, scheme);
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

const DARK_BORDER_CONTRAST = 3;
const PAN_STEP = 23;
const PAN_STEPS = 12;

const dragGraph = async (page: Page, dx: number, dy: number): Promise<void> => {
  const graph = await page.locator('#graph').boundingBox();
  if (graph === null) throw new Error('the graph has no box');
  const x = graph.x + graph.width / 2;
  const y = graph.y + graph.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 2 });
  await page.mouse.up();
};

describe('the edge hints in Chromium', () => {
  it.each(SCHEMES)('cover no box while the graph pans, in %s mode', async (scheme) => {
    const page = await openPage({ fixture: 'review', view: 'Diff' }, scheme, NARROW);
    const problems: string[] = [];
    let hintsSeen = 0;
    for (const [dx, dy] of [
      [0, PAN_STEP],
      [PAN_STEP, 0],
      [0, -PAN_STEP],
      [-PAN_STEP, 0],
    ] as const) {
      for (let step = 0; step < PAN_STEPS; step++) {
        const { hints, covers } = await page.evaluate(hintsOverBoxes);
        hintsSeen += hints;
        problems.push(...covers);
        await dragGraph(page, dx, dy);
      }
    }
    await page.close();
    expect(hintsSeen).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});

describe('the zoom controls in Chromium', () => {
  it.each(SCHEMES)(
    'give the zoom label room for "Overview" and keep one width at every zoom, in %s mode',
    async (scheme) => {
      const page = await openPage({ fixture: 'levels', view: 'Whole project' }, scheme);
      const percent = await page.evaluate(zoomLabelRoom);
      await zoomOutTo(page, 'map');
      const overview = await page.evaluate(zoomLabelRoom);
      await page.close();
      expect(percent.text).toMatch(/%$/);
      expect(overview.text).toBe('Overview');
      expect(overview.controls).toBe(percent.controls);
      for (const { text, left, right } of [percent, overview]) {
        expect(left, `the room left of "${text}"`).toBeGreaterThanOrEqual(6);
        expect(right, `the room right of "${text}"`).toBeGreaterThanOrEqual(6);
      }
    },
  );
});

describe('the level boxes in the Map band in Chromium', () => {
  it.each(SCHEMES)(
    'keep their chips at their size at the reading floor and show their borders, in %s mode',
    async (scheme) => {
      const page = await openPage(
        { fixture: 'levels', view: 'Whole project', level: 'src/orders' },
        scheme,
      );
      await zoomOutTo(page, 'map');
      const problems = await page.evaluate(mapBandProblems, {
        borderContrast: scheme === 'dark' ? DARK_BORDER_CONTRAST : 0,
      });
      await page.close();
      expect(problems).toEqual([]);
    },
  );
});
