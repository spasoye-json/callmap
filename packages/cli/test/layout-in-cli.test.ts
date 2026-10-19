import { beforeAll, describe, expect, it } from 'vitest';
import type { Place, Placement } from '../page/layout.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  framesOf,
  loadReaderPage,
  openTab,
  pageDataOf,
  reviewHtmlOf,
  withPageData,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const MONEY = 'src/money.ts';
const SHIFT = 1000;

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const shiftedPlace = ([x, y, width, height]: Place): Place => [x + SHIFT, y, width, height];

const shifted = (placement: Placement): Placement => ({
  frames: placement.frames.map(shiftedPlace),
  boxes: placement.boxes.map(shiftedPlace),
  lines: placement.lines.map(({ points, label }) => ({
    points: points.map(([x, y]) => [x + SHIFT, y] as const),
    ...(label === undefined ? {} : { label: shiftedPlace(label) }),
  })),
  width: placement.width + SHIFT,
  height: placement.height,
});

const withShiftedPlaces = (view: string): string => {
  const data = pageDataOf(html);
  const placement = data.placements[view];
  if (placement === undefined) throw new Error(`the page data holds no places for ${view}`);
  return withPageData(html, {
    ...data,
    placements: { ...data.placements, [view]: shifted(placement) },
  });
};

const leftEdgesOf = (page: LoadedPage): Readonly<Record<string, number>> =>
  Object.fromEntries([...boxesOf(page), ...framesOf(page)].map(({ id, x }) => [id, x]));

const movedBy = (edges: Readonly<Record<string, number>>, shift: number) =>
  Object.fromEntries(Object.entries(edges).map(([id, x]) => [id, x + shift]));

describe('the layout that the command writes into the page', () => {
  it('holds the places of the Diff view and the Whole project view only', () => {
    expect(Object.keys(pageDataOf(html).placements).sort()).toEqual(['Diff', 'Whole project']);
  });

  it('draws the Diff view at the places in the page data, with no layout in the page', async () => {
    const laidOut = await loadReaderPage(html);
    const moved = await loadReaderPage(withShiftedPlaces('Diff'));
    expect(leftEdgesOf(moved)).toEqual(movedBy(leftEdgesOf(laidOut), SHIFT));
  });

  it('draws the Whole project view at the places in the page data, with no layout in the page', async () => {
    const laidOut = await loadReaderPage(html);
    await openTab(laidOut, 'Whole project');
    const moved = await loadReaderPage(withShiftedPlaces('Whole project'));
    await openTab(moved, 'Whole project');
    expect(leftEdgesOf(moved)).toEqual(movedBy(leftEdgesOf(laidOut), SHIFT));
  });

  it('lays out the Diff view again in the page after a next hop opens more functions', async () => {
    const laidOut = await loadReaderPage(html);
    await clickBox(laidOut, `${MONEY}#format`);
    const moved = await loadReaderPage(withShiftedPlaces('Diff'));
    await clickBox(moved, `${MONEY}#format`);
    expect(leftEdgesOf(moved)).toEqual(leftEdgesOf(laidOut));
  });
});
