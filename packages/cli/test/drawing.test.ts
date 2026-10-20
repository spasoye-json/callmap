import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  COUNTDOWN,
  countdownRepo,
  featureBranchRepo,
  featureBranchRepoWithUnchangedFiles,
  levelsRepo,
} from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  chooseEntry,
  clickBox,
  linesOf,
  framesOf,
  loadReaderPage,
  openTab,
  pickFolder,
  runCallmap,
} from './reader-page.ts';
import type { DrawnBox, DrawnLine, LoadedPage, Point } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const MONEY = 'src/money.ts';
const CART = 'src/cart.ts';

let html = '';
let folderHtml = '';
let cycleHtml = '';
let levelsHtml = '';

const reviewPageOf = (repo: string): string => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

beforeAll(() => {
  html = reviewPageOf(featureBranchRepo());
  folderHtml = reviewPageOf(featureBranchRepoWithUnchangedFiles());
  cycleHtml = reviewPageOf(countdownRepo());
  levelsHtml = reviewPageOf(levelsRepo());
}, 120_000);

const folderViewOf = async (folder: string): Promise<LoadedPage> => {
  const page = await loadReaderPage(folderHtml);
  await openTab(page, 'Folder');
  await pickFolder(page, folder);
  return page;
};

type Segment = readonly [Point, Point];

const segmentsOf = ({ points }: DrawnLine): readonly Segment[] =>
  points.slice(1).map((point, index): Segment => [points[index] ?? point, point]);

const isStraight = ([[x1, y1], [x2, y2]]: Segment): boolean => x1 === x2 || y1 === y2;

const INSET = 1;

const enters = ([[x1, y1], [x2, y2]]: Segment, { x, y, width, height }: DrawnBox): boolean => {
  const left = Math.max(Math.min(x1, x2), x + INSET);
  const right = Math.min(Math.max(x1, x2), x + width - INSET);
  const top = Math.max(Math.min(y1, y2), y + INSET);
  const bottom = Math.min(Math.max(y1, y2), y + height - INSET);
  return left <= right && top <= bottom;
};

const crossingsOf = (page: LoadedPage): readonly string[] => {
  const boxes = boxesOf(page);
  return linesOf(page).flatMap((line) =>
    boxes
      .filter(({ id }) => id !== line.from && id !== line.to)
      .filter((box) => segmentsOf(line).some((segment) => enters(segment, box)))
      .map((box) => `${line.from} -> ${line.to} crosses ${box.id}`),
  );
};

const pagesToCheck = async (): Promise<readonly [string, LoadedPage][]> => {
  const opened = await loadReaderPage(html);
  await clickBox(opened, `${MONEY}#format`);
  await clickBox(opened, `${CART}#subtotal`);
  const project = await loadReaderPage(html);
  await openTab(project, 'Whole project');
  const route = await loadReaderPage(html);
  await openTab(route, 'Route');
  const checkout = await loadReaderPage(html);
  await openTab(checkout, 'Route');
  await chooseEntry(checkout, 'checkout');
  return [
    ['the review', await loadReaderPage(html)],
    ['the review after two next hops', opened],
    ['the Whole project view', project],
    ['the Folder view of src/tax', await folderViewOf('src/tax/')],
    ['the Folder view of src', await folderViewOf('src/')],
    ['the Route view', route],
    ['the Route view of checkout', checkout],
  ];
};

const BACK_CALL = `${COUNTDOWN}#tock -> ${COUNTDOWN}#tick`;

const routeWithACycle = async (): Promise<[string, LoadedPage]> => {
  const page = await loadReaderPage(cycleHtml);
  await openTab(page, 'Route');
  await chooseEntry(page, 'countdown');
  return ['the Route view of a cycle', page];
};

const pagesWithACycleToCheck = async (): Promise<readonly [string, LoadedPage][]> => [
  ...(await pagesToCheck()),
  await routeWithACycle(),
];

const levelOf = async (...path: readonly string[]): Promise<[string, LoadedPage]> => {
  const page = await loadReaderPage(levelsHtml);
  await openTab(page, 'Whole project');
  for (const box of path) await clickBox(page, box);
  return [`the level ${path.at(-1) ?? 'at the top'}`, page];
};

const levelsToCheck = async (): Promise<readonly [string, LoadedPage][]> => [
  await levelOf(),
  await levelOf('src/orders'),
  await levelOf('src/orders', 'src/orders/api'),
  await levelOf('src/orders', 'src/orders/service'),
  await levelOf('src/shipping/carriers'),
  await levelOf('src/money'),
  await levelOf('src/notify'),
  await levelOf('src/notify', 'src/notify/channel.ts'),
  await levelOf('src/notify', 'src/notify/sms.ts'),
  await levelOf('src/orders', 'src/orders/service', 'src/orders/service/book.ts'),
  await levelOf('src/orders', 'src/orders/api', 'src/orders/api/place.ts'),
  await levelOf('src/shipping/carriers', 'src/shipping/carriers/courier.ts'),
  await levelOf('src/money', 'src/money/round.ts'),
];

const pagesWithLevelsToCheck = async (): Promise<readonly [string, LoadedPage][]> => [
  ...(await pagesWithACycleToCheck()),
  ...(await levelsToCheck()),
];

describe('the lines of the drawing', () => {
  it('draws every segment of every line horizontal or vertical', async () => {
    for (const [name, page] of await pagesWithLevelsToCheck()) {
      const lines = linesOf(page);
      expect(lines.length, name).toBeGreaterThan(0);
      for (const line of lines) {
        expect(segmentsOf(line).every(isStraight), `${name}: ${line.from} -> ${line.to}`).toBe(
          true,
        );
      }
    }
  }, 30_000);

  it('draws no segment of a line through a box that is not its caller or its callee', async () => {
    for (const [name, page] of await pagesWithLevelsToCheck()) {
      expect(crossingsOf(page), name).toEqual([]);
    }
  }, 30_000);

  it('draws each caller left of its callee, except the call back of a cycle', async () => {
    for (const [name, page] of await pagesWithACycleToCheck()) {
      const boxes = new Map([...framesOf(page), ...boxesOf(page)].map((box) => [box.id, box]));
      for (const { from, to } of linesOf(page)) {
        if (`${from} -> ${to}` === BACK_CALL) continue;
        const caller = boxes.get(from);
        const callee = boxes.get(to);
        expect(caller, `${name}: ${from}`).toBeDefined();
        expect(callee, `${name}: ${to}`).toBeDefined();
        if (caller === undefined || callee === undefined) continue;
        expect(caller.x + caller.width, `${name}: ${from} -> ${to}`).toBeLessThanOrEqual(callee.x);
      }
    }
  }, 30_000);
});

const SHORTEST_PART_FOR_A_BADGE = 32;
const NEXT_TO_THE_CALLER = 24;

const lengthOf = ([[x1, y1], [x2, y2]]: Segment): number => Math.abs(x2 - x1) + Math.abs(y2 - y1);

const middleOf = ([[x1, y1], [x2, y2]]: Segment): Point => [(x1 + x2) / 2, (y1 + y2) / 2];

const isOn = ([x, y]: Point, [[x1, y1], [x2, y2]]: Segment): boolean =>
  Math.min(x1, x2) <= x && x <= Math.max(x1, x2) && Math.min(y1, y2) <= y && y <= Math.max(y1, y2);

interface DrawnBadge {
  readonly line: DrawnLine;
  readonly centre: Point;
}

const badgesOf = ({ window }: LoadedPage): readonly DrawnBadge[] =>
  [...window.document.querySelectorAll('#graph [data-from]')].flatMap((element) => {
    const badge = element.querySelector(':scope > .label.badge');
    if (badge === null) return [];
    const [x = '', y = ''] = (badge.getAttribute('data-keep-size') ?? '').split(',');
    const path = element.querySelector('path')?.getAttribute('d') ?? '';
    const points = [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, px, py]): Point => [
      Number(px),
      Number(py),
    ]);
    const line: DrawnLine = {
      from: element.getAttribute('data-from') ?? '',
      to: element.getAttribute('data-to') ?? '',
      classes: [...element.classList],
      label: badge.textContent,
      points,
    };
    return [{ line, centre: [Number(x), Number(y)] }];
  });

describe('the count badges of the lines', () => {
  it('puts each count badge at the middle of the longest straight part of its line, or next to the caller when no part is 32 px long', async () => {
    let checked = 0;
    for (const [name, page] of await pagesWithLevelsToCheck()) {
      for (const { line, centre } of badgesOf(page)) {
        checked += 1;
        const segments = segmentsOf(line);
        const longest = Math.max(...segments.map(lengthOf));
        const where = `${name}: ${line.from} -> ${line.to}`;
        if (longest >= SHORTEST_PART_FOR_A_BADGE) {
          const middles = segments.filter((part) => lengthOf(part) === longest).map(middleOf);
          expect(
            middles.some(([x, y]) => x === centre[0] && y === centre[1]),
            `${where} has its badge at ${centre.join(',')}`,
          ).toBe(true);
        } else {
          const [first] = segments;
          const [start] = line.points;
          expect(first !== undefined && isOn(centre, first), where).toBe(true);
          expect(lengthOf([start ?? centre, centre]), where).toBeLessThanOrEqual(
            NEXT_TO_THE_CALLER,
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);
});

const transformOf = ({ window }: LoadedPage): string =>
  window.document.querySelector('#graph svg > g')?.getAttribute('transform') ?? '';

const svgOf = ({ window }: LoadedPage): Element => {
  const svg = window.document.querySelector('#graph svg');
  if (svg === null) throw new Error('the page draws no SVG');
  return svg;
};

const scaleOf = (transform: string): number => Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);

const onScreen = (page: LoadedPage, id: string): Point => {
  const [, x = '', y = '', scale = ''] =
    /translate\((-?[\d.]+),(-?[\d.]+)\) scale\(([\d.]+)\)/.exec(transformOf(page)) ?? [];
  const box = boxesOf(page).find((candidate) => candidate.id === id);
  if (box === undefined) throw new Error(`the drawing holds no box ${id}`);
  return [
    Number(x) + Number(scale) * (box.x + box.width / 2),
    Number(y) + Number(scale) * (box.y + box.height / 2),
  ];
};

describe('the drawing', () => {
  it('keeps a neighbour at its place on the screen when a click opens its next hop', async () => {
    const page = await loadReaderPage(html);
    const before = onScreen(page, `${MONEY}#format`);
    await clickBox(page, `${MONEY}#format`);
    const [x, y] = onScreen(page, `${MONEY}#format`);
    expect(x).toBeCloseTo(before[0]);
    expect(y).toBeCloseTo(before[1]);
  });

  it('zooms in and out with the mouse wheel', async () => {
    const page = await loadReaderPage(html);
    const before = scaleOf(transformOf(page));
    fireEvent.wheel(svgOf(page), { deltaY: -200, clientX: 100, clientY: 100 });
    const nearer = scaleOf(transformOf(page));
    expect(nearer).toBeGreaterThan(before);
    fireEvent.wheel(svgOf(page), { deltaY: 400, clientX: 100, clientY: 100 });
    expect(scaleOf(transformOf(page))).toBeLessThan(nearer);
  });

  it('pans with a drag, and a drag that ends on a box does not open its code', async () => {
    const page = await loadReaderPage(html);
    const before = transformOf(page);
    const box = boxElementOf(page, `${CART}#taxed`);
    if (box === undefined) throw new Error('the drawing lost a box');
    fireEvent.pointerDown(box, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 90, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 90, clientY: 50, pointerId: 1 });
    fireEvent.click(box);
    expect(transformOf(page)).not.toBe(before);
    expect(within(page.window.document.body).queryByRole('heading', { name: 'taxed' })).toBeNull();
  });

  it('opens the code of a box with the keyboard', async () => {
    const page = await loadReaderPage(html);
    const box = within(page.window.document.body).getByRole('button', {
      name: `taxed, ${CART}, added`,
    });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(within(page.window.document.body).getByRole('heading', { name: 'taxed' })).toBeDefined();
  });

  it('holds no Cytoscape', () => {
    expect(html).not.toMatch(/cytoscape/i);
  });
});
