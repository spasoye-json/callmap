import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { COUNTDOWN, countdownRepo, featureBranchRepo } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  chooseEntry,
  clickBox,
  linesOf,
  framesOf,
  loadReaderPage,
  openTab,
  reviewHtmlOf,
  runArchmap,
} from './reader-page.ts';
import type { DrawnBox, DrawnLine, LoadedPage, Point } from './reader-page.ts';

const MONEY = 'src/money.ts';
const CART = 'src/cart.ts';

let html = '';
let cycleHtml = '';

beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', featureBranchRepo(), '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  html = readFileSync(out, 'utf8');
  cycleHtml = reviewHtmlOf(countdownRepo());
}, 120_000);

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

describe('the lines of the drawing', () => {
  it('draws every segment of every line horizontal or vertical', async () => {
    for (const [name, page] of await pagesWithACycleToCheck()) {
      const lines = linesOf(page);
      expect(lines.length, name).toBeGreaterThan(0);
      for (const line of lines) {
        expect(segmentsOf(line).every(isStraight), `${name}: ${line.from} -> ${line.to}`).toBe(
          true,
        );
      }
    }
  });

  it('draws no segment of a line through a box that is not its caller or its callee', async () => {
    for (const [name, page] of await pagesWithACycleToCheck()) {
      expect(crossingsOf(page), name).toEqual([]);
    }
  });

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
  });
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
