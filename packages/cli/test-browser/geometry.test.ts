import type { Page } from 'playwright-core';
import type { CornerLook } from './problems.ts';
import { describe, expect, it } from 'vitest';
import {
  featureBranchRepoWithUnchangedFiles,
  levelsRepo,
  longNamesRepo,
} from '../test/fixture-repo.ts';
import { meets } from '../test/screen-rect.ts';
import {
  cornerLookOf,
  cornerPlaceOf,
  hintsOverBoxes,
  mapBandProblems,
  problemsOnPage,
  zoomLabelRoom,
} from './problems.ts';
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

describe('the corner of the graph in Chromium', () => {
  const RECEIPT = 'src/cart.ts#receipt';
  const SMALLEST = { width: 536, height: 460 };
  const OVERVIEW_MAP_STATES = ['open', 'collapsed'] as const;

  const openWithOverviewMap = async (
    overviewMap: (typeof OVERVIEW_MAP_STATES)[number],
    viewport: { readonly width: number; readonly height: number },
  ): Promise<Page> => {
    const page = await openPage({ fixture: 'review', view: 'Diff' }, 'light', viewport);
    if (overviewMap === 'collapsed')
      await page.getByRole('button', { name: 'Overview map' }).click();
    return page;
  };

  it.each(OVERVIEW_MAP_STATES)(
    'keeps a clicked box clear of it, with the overview map %s',
    async (overviewMap) => {
      const page = await openWithOverviewMap(overviewMap, NARROW);
      const { corner } = await page.evaluate(cornerPlaceOf, RECEIPT);
      const box = await page.locator(`#graph [data-box="${RECEIPT}"] > rect`).boundingBox();
      if (box === null) throw new Error(`the graph shows no box ${RECEIPT}`);
      await dragGraph(
        page,
        corner.x - (box.x + box.width / 2),
        corner.y - (box.y + box.height / 2),
      );
      const before = await page.evaluate(cornerPlaceOf, RECEIPT);
      await page.mouse.click(before.free.x, before.free.y);
      await settled(page);
      const after = await page.evaluate(cornerPlaceOf, RECEIPT);
      await page.close();
      expect(before.under).toBe(true);
      expect(after).toMatchObject({ under: false, inGraph: true });
    },
  );

  it('opens a level with the anchor box clear of it, in the smallest graph, with the overview map open', async () => {
    const page = await openWithOverviewMap('open', SMALLEST);
    const first = await page.evaluate(cornerPlaceOf, RECEIPT);
    await page.getByRole('tab', { name: 'Whole project', exact: true }).click();
    await settled(page);
    await page.getByRole('tab', { name: 'Diff', exact: true }).click();
    await settled(page);
    const again = await page.evaluate(cornerPlaceOf, RECEIPT);
    await page.close();
    expect(first).toMatchObject({ under: false, inGraph: true });
    expect(again).toMatchObject({ under: false, inGraph: true });
  });

  const SHORT = { width: 900, height: 348 };

  const toggleProblems = ({ controls, label, toggle, overviewMap }: CornerLook): string[] => [
    ...(meets(toggle, label) ? ['the map toggle meets the zoom label'] : []),
    ...(toggle.right > controls.right || toggle.left < controls.left
      ? ['the map toggle runs past the zoom controls']
      : []),
    ...(overviewMap.width > 0 && meets(controls, overviewMap)
      ? ['the zoom controls meet the overview map']
      : []),
  ];

  it.each(SCHEMES)(
    'shows the map toggle in the zoom controls, and drops the zoom controls to the bottom after a collapse, in %s mode',
    async (scheme) => {
      const page = await openPage({ fixture: 'review', view: 'Diff' }, scheme, SHORT);
      const toggle = page.getByRole('button', { name: 'Overview map' });
      const open = await page.evaluate(cornerLookOf);
      await toggle.click();
      const collapsed = await page.evaluate(cornerLookOf);
      await toggle.click();
      const reopened = await page.evaluate(cornerLookOf);
      await page.close();
      expect(toggleProblems(open)).toEqual([]);
      expect(toggleProblems(collapsed)).toEqual([]);
      expect(collapsed.overviewMap.width).toBe(0);
      expect(collapsed.controls.bottom).toBe(collapsed.graphBottom - 16);
      expect(open.controls.bottom).toBeLessThan(open.overviewMap.top);
      expect(reopened.controls).toEqual(open.controls);
      expect(open.hints.length).toBeGreaterThan(0);
      for (const hint of open.hints) {
        expect(meets(hint, open.overviewMap), 'a hint meets the open overview map').toBe(false);
        expect(meets(hint, open.controls), 'a hint meets the zoom controls').toBe(false);
      }
      for (const hint of collapsed.hints)
        expect(meets(hint, collapsed.controls), 'a hint meets the zoom controls').toBe(false);
      expect(
        collapsed.hints.some((hint) => meets(hint, open.overviewMap)),
        'a hint takes the place of the collapsed overview map',
      ).toBe(true);
    },
  );
});
