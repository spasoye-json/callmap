import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, fixtureText } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  loadReaderPage,
  pressBox,
  reviewHtmlOf,
  settled,
  storedItemsOf,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

const readFunction = async (id: string): Promise<LoadedPage> => {
  const page = await loadReaderPage(html);
  await clickBox(page, id);
  return page;
};

const textsOf = (elements: readonly Element[]): readonly string[] =>
  elements.map((element) => element.textContent);

const editorOf = ({ window }: LoadedPage): Element => {
  const editor = window.document.querySelector('.code-panel .cm-editor');
  if (editor === null) throw new Error('the code panel shows no editor');
  return editor;
};

const changedTextOf = (lines: readonly Element[], mark: string): readonly string[] =>
  lines.map((line) => textsOf([...line.querySelectorAll(mark)]).join(''));

const lineNumbersOf = (page: LoadedPage): readonly string[] =>
  [...editorOf(page).querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .filter((element) => !(element as HTMLElement).style.visibility.includes('hidden'))
    .flatMap((element) => {
      const removed = element.querySelector('.removed-line-numbers');
      return removed === null ? [element.textContent] : textsOf([...removed.children]);
    });

const numberMarksOf = (page: LoadedPage): readonly string[] =>
  [...editorOf(page).querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .filter((element) => !(element as HTMLElement).style.visibility.includes('hidden'))
    .flatMap((element) => {
      const removed = element.querySelector('.removed-line-numbers');
      if (removed !== null) return [...removed.children].map((number) => number.className);
      return [element.classList.contains('added-number') ? 'added-number' : 'kept'];
    });

describe('the diff in the code panel', () => {
  it('shows the removed lines of a changed function above the lines that the branch added', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#receipt`));
    expect(textsOf(panel.getAllByRole('deletion'))).toEqual([
      '  const total = legacyTotal(prices);',
      "  return `${label('total')}: ${format(total)}`;",
    ]);
    expect(textsOf(panel.getAllByRole('insertion'))).toEqual([
      '  const total = taxed(prices);',
      '  return format(total);',
    ]);
  });

  it('marks the exact characters that changed inside a changed line, on both sides', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#receipt`));
    expect(changedTextOf(panel.getAllByRole('deletion'), '.cm-deletedText')).toEqual([
      'legacyTotal',
      "`${label('total')}: ${}`",
    ]);
    expect(changedTextOf(panel.getAllByRole('insertion'), '.cm-changedText')).toEqual([
      'taxed',
      '',
    ]);
  });

  it('numbers each line as the file numbers it, the base line for a removed line and the branch line for the others', async () => {
    expect(lineNumbersOf(await readFunction(`${CART}#receipt`))).toEqual([
      '8',
      '11',
      '12',
      '9',
      '10',
      '11',
    ]);
  });

  it('marks a line that the branch only added as added only, so that no part of it shows as a changed part', async () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      CART,
      fixtureText('branch', CART).replace(
        '  return format(total);',
        '  console.log(total);\n  return format(total);',
      ),
    );
    const page = await loadReaderPage(reviewHtmlOf(repo, '--base', 'HEAD~1'));
    await clickBox(page, `${CART}#receipt`);
    const added = codePanelOf(page).getAllByRole('insertion');
    expect(textsOf(added)).toEqual(['  console.log(total);']);
    expect(added[0]?.closest('.cm-line')?.classList.contains('added-only')).toBe(true);
  }, 60_000);

  it('tints the line number of each removed and each added line, as GitHub does', async () => {
    expect(numberMarksOf(await readFunction(`${CART}#receipt`))).toEqual([
      'kept',
      'removed-number',
      'removed-number',
      'added-number',
      'added-number',
      'kept',
    ]);
    expect(numberMarksOf(await readFunction(`${CART}#taxed`))).toEqual(['added-number']);
  });

  it('shows every line of an added function as added, with no removed line', async () => {
    const page = await readFunction(`${CART}#taxed`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('deletion')).toEqual([]);
    expect(textsOf(panel.getAllByRole('insertion'))).toEqual([
      'export const taxed = (prices: readonly number[]): number => subtotal(prices) * 1.25;',
    ]);
    expect(lineNumbersOf(page)).toEqual(['6']);
  });

  it('shows every line of a removed function as removed, with the line numbers of the base', async () => {
    const page = await readFunction(`${CART}#legacyTotal`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('insertion')).toEqual([]);
    expect(textsOf(panel.getAllByRole('deletion'))).toEqual([
      'export const legacyTotal = (prices: readonly number[]): number => subtotal(prices) * 1.2;',
    ]);
    expect(lineNumbersOf(page)).toEqual(['6']);
  });

  it('shows the code of a function that the branch did not change with no diff', async () => {
    const page = await readFunction(`${CART}#subtotal`);
    const panel = codePanelOf(page);
    expect(panel.queryAllByRole('insertion')).toEqual([]);
    expect(panel.queryAllByRole('deletion')).toEqual([]);
    expect(panel.getByRole('textbox').textContent).toBe(
      'export const subtotal = (prices: readonly number[]): number =>  round(prices.reduce((sum, price) => sum + price, 0));',
    );
    expect(lineNumbersOf(page)).toEqual(['3', '4']);
  });

  it('highlights the syntax of a TypeScript file', async () => {
    const panel = codePanelOf(await readFunction(`${CART}#subtotal`));
    expect(panel.getByText('export').className).toMatch(/syntax-keyword/);
    expect(panel.getByText('0').className).toMatch(/syntax-literal/);
  });

  it('lets the reader read the code but not change it', async () => {
    const textbox = codePanelOf(await readFunction(`${CART}#receipt`)).getByRole('textbox');
    expect(textbox.getAttribute('aria-readonly')).toBe('true');
    expect(textbox.getAttribute('contenteditable')).toBe('false');
  });
});

describe('the file texts of the page', () => {
  it('shows the code of a box that the reader clicks before the texts are ready, when they are ready', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const page = await loadReaderPage(html, undefined, held);
    pressBox(page, `${CART}#receipt`);
    expect(codePanelOf(page).getByRole('heading', { name: 'receipt' })).toBeDefined();
    expect(codePanelOf(page).queryByRole('textbox')).toBeNull();

    release();
    await settled(page);

    expect(textsOf(codePanelOf(page).getAllByRole('insertion'))).toEqual([
      '  const total = taxed(prices);',
      '  return format(total);',
    ]);
  });
});

describe('the size of the code panel', () => {
  it('starts collapsed, and opens after a click on a box', async () => {
    const page = await loadReaderPage(html);
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
    await clickBox(page, `${CART}#receipt`);
    expect(codePanelOf(page).getByRole('heading', { name: 'receipt' })).toBeDefined();
  });

  it('collapses after a click on its collapse button, and opens again after a click on a box', async () => {
    const page = await readFunction(`${CART}#receipt`);
    fireEvent.click(bodyOf(page).getByRole('button', { name: 'Collapse the code panel' }));
    expect(bodyOf(page).queryByRole('region', { name: 'Code' })).toBeNull();
    await clickBox(page, `${CART}#taxed`);
    expect(codePanelOf(page).getByRole('heading', { name: 'taxed' })).toBeDefined();
  });

  it('grows by the distance that the reader drags its left edge to the left, also when the browser gives no localStorage', async () => {
    const page = await readFunction(`${CART}#receipt`);
    const edge = bodyOf(page).getByRole('separator', { name: 'Width of the code panel' });
    const before = Number(edge.getAttribute('aria-valuenow'));
    fireEvent.pointerDown(edge, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(edge, { clientX: 640, pointerId: 1 });
    fireEvent.pointerUp(edge, { clientX: 640, pointerId: 1 });
    expect(Number(edge.getAttribute('aria-valuenow'))).toBe(before + 60);
    expect(
      bodyOf(page)
        .getByRole('complementary', { name: 'Code panel' })
        .style.getPropertyValue('--panel-width'),
    ).toBe(`${String(before + 60)}px`);
  });

  it('keeps the width that the reader chose for the next page load', async () => {
    const page = await loadReaderPage(html, {});
    await clickBox(page, `${CART}#receipt`);
    const edge = bodyOf(page).getByRole('separator', { name: 'Width of the code panel' });
    const before = edge.getAttribute('aria-valuenow');
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    const chosen = edge.getAttribute('aria-valuenow');
    expect(chosen).not.toBe(before);
    const next = await loadReaderPage(html, storedItemsOf(page));
    await clickBox(next, `${CART}#receipt`);
    expect(
      bodyOf(next)
        .getByRole('separator', { name: 'Width of the code panel' })
        .getAttribute('aria-valuenow'),
    ).toBe(chosen);
  });

  it('pans the graph to the selected box when the open panel would hide it, with no new layout', async () => {
    const page = await loadReaderPage(html);
    const { document } = page.window;
    const graph = document.getElementById('graph');
    if (graph === null) throw new Error('the page holds no graph');
    const panelOpen = (): boolean =>
      document.querySelector<HTMLElement>('.code-panel')?.hidden === false;
    const visibleWidth = (): number => (panelOpen() ? 300 : 1200);
    graph.getBoundingClientRect = (): DOMRect => {
      const width = visibleWidth();
      const height = 2000;
      const box = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
      return { ...box, toJSON: () => box };
    };
    const changed = boxesOf(page).filter(({ classes }) => classes.includes('changed'));
    const far = changed.sort((left, right) => right.x - left.x)[0];
    if (far === undefined) throw new Error('the drawing holds no changed box');
    expect(far.x + far.width).toBeGreaterThan(300);

    await clickBox(page, far.id);

    const transform = document.querySelector('.viewport')?.getAttribute('transform') ?? '';
    const [x = Number.NaN, scale = Number.NaN] = (
      /translate\((-?[\d.]+),-?[\d.]+\) scale\(([\d.]+)\)/.exec(transform) ?? []
    )
      .slice(1)
      .map(Number);
    expect(scale).toBe(1);
    expect(x + far.x * scale).toBeGreaterThanOrEqual(0);
    expect(x + (far.x + far.width) * scale).toBeLessThanOrEqual(300);
    const after = boxesOf(page).find(({ id }) => id === far.id);
    expect([after?.x, after?.y]).toEqual([far.x, far.y]);
  });
});

describe('the colours of the diff', () => {
  const oklabOf = (hex: string): readonly number[] => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
      const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };

  const tokensOf = (block: string): ReadonlyMap<string, string> =>
    new Map(
      [...block.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-f]{6})/g)].map(([, token = '', value = '']) => [
        token,
        value,
      ]),
    );

  const strength = (tokens: ReadonlyMap<string, string>, token: string): number => {
    const [base, colour] = [tokens.get('--code'), tokens.get(token)];
    if (base === undefined || colour === undefined) throw new Error(`no ${token}`);
    const [from, to] = [oklabOf(base), oklabOf(colour)];
    return Math.hypot(...from.map((value, index) => value - (to[index] ?? 0)));
  };

  it.each([
    ['light', /<style>\s*:root\s*\{([^}]*)\}/],
    ['dark', /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/],
  ])(
    'gives a removed line and an added line a clear colour in %s mode, and a stronger one to the changed characters',
    (_mode, block) => {
      const tokens = tokensOf(block.exec(html)?.[1] ?? '');
      const removedLine = strength(tokens, '--diff-removed-line');
      const addedLine = strength(tokens, '--diff-added-line');
      const removedWord = strength(tokens, '--diff-removed-word');
      const addedWord = strength(tokens, '--diff-added-word');
      expect(Math.min(removedLine, addedLine)).toBeGreaterThan(0.04);
      expect(Math.min(removedWord, addedWord)).toBeGreaterThan(
        Math.max(removedLine, addedLine) + 0.06,
      );
    },
  );
});
