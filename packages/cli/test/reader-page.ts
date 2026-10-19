import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, within } from '@testing-library/dom';
import { JSDOM } from 'jsdom';
import type { ReaderPageData } from '../page/data.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

export interface Opener {
  readonly bin: string;
  readonly marker: string;
}

export const fakeOpener = (): Opener => {
  const bin = mkdtempSync(join(tmpdir(), 'callmap-opener-'));
  const marker = join(bin, 'opened');
  for (const name of ['xdg-open', 'open']) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\n`);
    chmodSync(path, 0o755);
  }
  return { bin, marker };
};

export const runCallmap = (args: readonly string[], opener?: Opener) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env:
      opener === undefined
        ? process.env
        : { ...process.env, PATH: `${opener.bin}${delimiter}${process.env['PATH'] ?? ''}` },
  });

export const reviewHtmlOf = (repo: string, ...flags: readonly string[]): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out, ...flags]);
  if (finished.status !== 0) throw new Error(finished.stderr);
  return readFileSync(out, 'utf8');
};

export const pageDataOf = (html: string): ReaderPageData => {
  const block = /<script type="application\/json" id="reader-page-data">([^<]*)<\/script>/.exec(
    html,
  );
  if (block?.[1] === undefined) throw new Error('the page holds no data block');
  return JSON.parse(block[1]) as ReaderPageData;
};

export type Point = readonly [number, number];

export interface DrawnBox {
  readonly id: string;
  readonly kind: string;
  readonly classes: readonly string[];
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DrawnFrame {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DrawnLine {
  readonly from: string;
  readonly to: string;
  readonly classes: readonly string[];
  readonly label: string;
  readonly points: readonly Point[];
}

export interface LoadedPage {
  readonly window: JSDOM['window'];
}

const LAYOUT_TIMEOUT = 10_000;

export const settled = async ({ window }: LoadedPage): Promise<void> => {
  const graph = window.document.getElementById('graph');
  const started = Date.now();
  while (graph?.getAttribute('aria-busy') !== 'false') {
    if (Date.now() - started > LAYOUT_TIMEOUT) throw new Error('the drawing did not settle');
    await new Promise((settle) => setTimeout(settle, 5));
  }
};

export type StoredItems = Readonly<Record<string, string>>;

const withStorage = (stored: StoredItems | undefined) =>
  stored === undefined
    ? {}
    : {
        url: 'http://localhost/',
        beforeParse: (window: JSDOM['window']) => {
          for (const [key, value] of Object.entries(stored))
            window.localStorage.setItem(key, value);
        },
      };

export const storedItemsOf = ({ window }: LoadedPage): StoredItems =>
  Object.fromEntries(
    Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index) ?? '';
      return [key, window.localStorage.getItem(key) ?? ''];
    }),
  );

export const loadReaderPage = async (html: string, stored?: StoredItems): Promise<LoadedPage> => {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    ...withStorage(stored),
  });
  const page = { window: dom.window };
  await settled(page);
  return page;
};

const numberOf = (element: Element | null, name: string): number =>
  Number(element?.getAttribute(name) ?? Number.NaN);

const textOf = (element: Element, selector: string): string =>
  element.querySelector(selector)?.textContent ?? '';

const rectOf = (element: Element) => {
  const rect = element.querySelector(':scope > rect');
  return {
    x: numberOf(rect, 'x'),
    y: numberOf(rect, 'y'),
    width: numberOf(rect, 'width'),
    height: numberOf(rect, 'height'),
  };
};

const drawn = ({ window }: LoadedPage, selector: string): readonly Element[] => [
  ...window.document.querySelectorAll(`#graph ${selector}`),
];

export const boxElementOf = (page: LoadedPage, id: string): Element | undefined =>
  drawn(page, '[data-box]').find((element) => element.getAttribute('data-box') === id);

export const boxesOf = (page: LoadedPage): readonly DrawnBox[] =>
  drawn(page, '[data-box]').map((element) => ({
    id: element.getAttribute('data-box') ?? '',
    kind: element.getAttribute('data-kind') ?? '',
    classes: [...element.classList],
    label: textOf(element, ':scope > text'),
    ...rectOf(element),
  }));

export const framesOf = (page: LoadedPage): readonly DrawnFrame[] =>
  drawn(page, '[data-frame]').map((element) => ({
    id: element.getAttribute('data-frame') ?? '',
    label: textOf(element, ':scope > text'),
    ...rectOf(element),
  }));

const pointsOf = (path: string): readonly Point[] =>
  [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]): Point => [Number(x), Number(y)]);

export const linesOf = (page: LoadedPage): readonly DrawnLine[] =>
  drawn(page, '[data-from]').map((element) => ({
    from: element.getAttribute('data-from') ?? '',
    to: element.getAttribute('data-to') ?? '',
    classes: [...element.classList],
    label: textOf(element, 'text'),
    points: pointsOf(element.querySelector('path')?.getAttribute('d') ?? ''),
  }));

const holds = (frame: DrawnFrame, box: DrawnBox): boolean =>
  frame.x <= box.x &&
  frame.y <= box.y &&
  box.x + box.width <= frame.x + frame.width &&
  box.y + box.height <= frame.y + frame.height;

export const frameAround = (page: LoadedPage, id: string): string | undefined => {
  const box = boxesOf(page).find((candidate) => candidate.id === id);
  if (box === undefined) return undefined;
  return framesOf(page)
    .filter((frame) => holds(frame, box))
    .sort((left, right) => left.width * left.height - right.width * right.height)[0]?.label;
};

export const framesAround = (page: LoadedPage, id: string): readonly DrawnFrame[] => {
  const box = boxesOf(page).find((candidate) => candidate.id === id);
  if (box === undefined) return [];
  return framesOf(page)
    .filter((frame) => holds(frame, box))
    .sort((left, right) => left.width * left.height - right.width * right.height);
};

export const callsOf = (page: LoadedPage): readonly DrawnLine[] =>
  linesOf(page).filter(({ classes }) => classes.includes('call'));

export const clickBox = async (page: LoadedPage, id: string): Promise<void> => {
  const box = boxElementOf(page, id);
  if (box === undefined) throw new Error(`the drawing holds no box ${id}`);
  box.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }));
  await settled(page);
};

export const openTab = async (page: LoadedPage, name: string): Promise<void> => {
  fireEvent.click(within(page.window.document.body).getByRole('tab', { name }));
  await settled(page);
};

export const entryListOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Entry points' }));

export const chooseEntry = async (page: LoadedPage, name: string): Promise<void> => {
  fireEvent.click(entryListOf(page).getByRole('button', { name: new RegExp(`^${name} `) }));
  await settled(page);
};

export const pickFolder = async (page: LoadedPage, folder: string): Promise<void> => {
  const tree = within(page.window.document.body).getByRole('navigation', { name: 'Folders' });
  fireEvent.click(within(tree).getByRole('button', { name: folder }));
  await settled(page);
};
