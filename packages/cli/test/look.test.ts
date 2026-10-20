import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  commitFile,
  featureBranchRepo,
  featureBranchRepoWithUnchangedFiles,
  git,
} from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  clickBox,
  hoverBox,
  linesOf,
  loadReaderPage,
  openTab,
  pickFolder,
  reviewHtmlOf,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const RECEIPT = `${CART}#receipt`;
const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';

const MARKS = ['changed', 'added', 'removed', 'neighbour'] as const;

const MANY = 'src/many';
const SIDE = 32;

const repoWithManyCallsOnBase = (): string => {
  const repo = featureBranchRepo();
  const numbers = Array.from({ length: SIDE }, (_, index) => index);
  git(repo, 'checkout', '--quiet', 'main');
  mkdirSync(join(repo, MANY));
  commitFile(
    repo,
    `${MANY}/callees.ts`,
    numbers
      .map((index) => `export const callee${String(index)} = (): number => ${String(index)};\n`)
      .join(''),
  );
  commitFile(
    repo,
    `${MANY}/callers.ts`,
    [
      `import { ${numbers.map((index) => `callee${String(index)}`).join(', ')} } from './callees';\n`,
      ...numbers.map(
        (caller) =>
          `export const caller${String(caller)} = (): number => ${numbers.map((index) => `callee${String(index)}()`).join(' + ')};\n`,
      ),
    ].join(''),
  );
  git(repo, 'checkout', '--quiet', 'feature');
  git(repo, 'merge', '--quiet', '--no-edit', 'main');
  return repo;
};

let html = '';
let manyHtml = '';
let folderHtml = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
  manyHtml = reviewHtmlOf(repoWithManyCallsOnBase());
  folderHtml = reviewHtmlOf(featureBranchRepoWithUnchangedFiles());
}, 240_000);

const styleOf = (page: string): string => /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? '';

const withoutTokens = (style: string): string =>
  style
    .replace(/^\s*:root\s*\{[^}]*\}/, '')
    .replace(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/, '');

describe('the colours of the page', () => {
  it('takes every colour from the tokens on :root', () => {
    const style = styleOf(html);
    expect(style).toMatch(/--paper:\s*#ffffff/);
    expect(withoutTokens(style)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('keeps --selected for the selection fill, and gives hover and focus the --hover token of light and dark mode', () => {
    const style = styleOf(html);
    const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
      style,
    )?.[1];
    expect(style).toMatch(/^\s*:root\s*\{[^}]*--hover:\s*#[0-9a-f]{6}/);
    expect(dark).toMatch(/--hover:\s*#[0-9a-f]{6}/);
    const rules = [...withoutTokens(style).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const hoverRules = rules.filter(([, selectors = '']) => /:hover|:focus/.test(selectors));
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const [, selectors = '', body = ''] of hoverRules) {
      expect(body, selectors.trim()).not.toContain('var(--selected)');
    }
  });

  it('fades the boxes and the lines off the selected path with the opacity token', () => {
    const style = styleOf(html);
    expect(style).toMatch(/--fade:\s*0?\.28/);
    expect(style).toMatch(/\.box\.faded,\s*\.line\.faded\s*\{\s*opacity:\s*var\(--fade\);/);
  });
});

describe('the marks of the function boxes', () => {
  it('shows each mark as a chip with its glyph on the box, and no chip on a box with no mark', async () => {
    const page = await loadReaderPage(html);
    const glyphs = boxesOf(page)
      .filter(({ kind }) => kind === 'function')
      .map(({ id, classes }) => {
        const chip = boxElementOf(page, id)?.querySelector('.chip');
        return [
          MARKS.find((mark) => classes.includes(mark)) ?? 'none',
          chip?.getAttribute('data-mark') ?? 'none',
          chip?.textContent ?? '',
        ];
      });
    expect(new Map(glyphs.map(([mark, chip, glyph]) => [mark, [chip, glyph]]))).toEqual(
      new Map([
        ['changed', ['changed', 'Δ']],
        ['added', ['added', '+']],
        ['removed', ['removed', '−']],
        ['neighbour', ['neighbour', '·']],
      ]),
    );
    expect(glyphs.every(([mark, chip]) => mark === chip)).toBe(true);
  });

  it('keeps the name of a box as its first text, after the chip joins the box', async () => {
    const page = await loadReaderPage(html);
    expect(boxesOf(page).find(({ id }) => id === `${CART}#legacyTotal`)?.label).toBe('legacyTotal');
  });
});

const declared = ({ window }: LoadedPage, element: Element, property: string): string => {
  let value = '';
  for (const sheet of window.document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof window.CSSStyleRule) || !element.matches(rule.selectorText)) continue;
      value = rule.style.getPropertyValue(property) || value;
    }
  }
  return value;
};

const shapeOf = (page: LoadedPage, id: string): Element => {
  const shape = boxElementOf(page, id)?.querySelector(':scope > rect');
  if (shape === null || shape === undefined) throw new Error(`the drawing holds no box ${id}`);
  return shape;
};

const filledBoxesOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ id }) => declared(page, shapeOf(page, id), 'fill') === 'var(--selected)')
    .map(({ id }) => id);

describe('the states of the boxes', () => {
  it('draws a removed box with a dashed border, and no other function box', async () => {
    const page = await loadReaderPage(html);
    const dashed = boxesOf(page)
      .filter(({ kind }) => kind === 'function')
      .filter(({ id }) => declared(page, shapeOf(page, id), 'stroke-dasharray') !== '')
      .map(({ id }) => id);
    expect(dashed).toEqual([`${CART}#legacyTotal`]);
  });

  it('fills the selected box as the only filled box, with a border in the focus colour', async () => {
    const page = await loadReaderPage(html);
    expect(filledBoxesOf(page)).toEqual([]);
    await clickBox(page, RECEIPT);
    expect(filledBoxesOf(page)).toEqual([RECEIPT]);
    expect(declared(page, shapeOf(page, RECEIPT), 'stroke')).toBe('var(--focus)');
  });

  it('gives a hovered box a border in the focus colour and no fill', async () => {
    const page = await loadReaderPage(html);
    hoverBox(page, RECEIPT);
    expect(boxElementOf(page, RECEIPT)?.classList.contains('hovered')).toBe(true);
    expect(filledBoxesOf(page)).toEqual([]);
    expect(declared(page, shapeOf(page, RECEIPT), 'stroke')).toBe('var(--focus)');
  });
});

const lineElementsOf = ({ window }: LoadedPage): readonly Element[] => [
  ...window.document.querySelectorAll('#graph [data-line]'),
];

const lineElementOf = (page: LoadedPage, from: string, to: string): Element => {
  const line = lineElementsOf(page).find(
    (element) =>
      element.getAttribute('data-from') === from && element.getAttribute('data-to') === to,
  );
  if (line === undefined) throw new Error(`the drawing holds no line ${from} -> ${to}`);
  return line;
};

const edgeOf = (line: Element): Element => {
  const edge = line.querySelector('path');
  if (edge === null) throw new Error('the line holds no path');
  return edge;
};

describe('the lines', () => {
  it('keeps the width of every line at every zoom', async () => {
    const page = await loadReaderPage(html);
    const lines = lineElementsOf(page);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(edgeOf(line).getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('ends an open end in a ring with a question mark, with no arrowhead', async () => {
    const page = await loadReaderPage(html);
    const [openEnd, ...others] = lineElementsOf(page).filter((line) =>
      line.classList.contains('open-end'),
    );
    expect(others).toEqual([]);
    expect(openEnd?.getAttribute('data-from')).toBe(`${ALERTS}#relay`);
    expect(openEnd === undefined ? 'none' : edgeOf(openEnd).getAttribute('marker-end')).toBeNull();
    expect(openEnd?.querySelector('.open-ring > circle')).not.toBeNull();
    expect(openEnd?.querySelector('.open-ring > text')?.textContent).toBe('?');
  });

  it('draws a junction dot on each call of a one-of group', async () => {
    const page = await loadReaderPage(html);
    const oneOf = lineElementsOf(page).filter((line) => line.classList.contains('one-of'));
    expect(oneOf.map((line) => line.getAttribute('data-to')).sort()).toEqual([
      `${NOTIFY}#Mail.send`,
      `${NOTIFY}#Sms.send`,
    ]);
    for (const line of oneOf) expect(line.querySelector('circle.junction')).not.toBeNull();
  });

  it('names the marks of the boxes at both ends of each line', async () => {
    const page = await loadReaderPage(html);
    const marks = new Map(
      boxesOf(page).map(({ id, classes }) => [
        id,
        MARKS.find((mark) => classes.includes(mark)) ?? 'none',
      ]),
    );
    const ends = lineElementsOf(page)
      .filter((line) => line.classList.contains('call'))
      .map((line) => [
        line.getAttribute('data-from-mark'),
        line.getAttribute('data-to-mark'),
        marks.get(line.getAttribute('data-from') ?? ''),
        marks.get(line.getAttribute('data-to') ?? ''),
      ]);
    expect(ends.length).toBeGreaterThan(0);
    for (const [fromMark, toMark, from, to] of ends) expect([fromMark, toMark]).toEqual([from, to]);
    expect(
      lineElementOf(
        page,
        `${ALERTS}#relay`,
        linesOf(page).find(({ classes }) => classes.includes('open-end'))?.to ?? '',
      ).getAttribute('data-to-mark'),
    ).toBe('open-end');
  });

  it('draws the lines of the selected path in the focus colour, and keeps the colour of an added call', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, RECEIPT);
    const lit = lineElementsOf(page).filter((line) => line.classList.contains('connected'));
    const kept = lit.find((line) => line.classList.contains('kept'));
    const added = lit.find((line) => line.classList.contains('added'));
    if (kept === undefined || added === undefined) throw new Error('the path lost a call');
    expect(declared(page, edgeOf(kept), 'stroke')).toBe('var(--focus)');
    expect(declared(page, edgeOf(added), 'stroke')).toBe('var(--added)');
    expect(declared(page, edgeOf(kept), 'stroke-width')).toBe('2');
  });
});

describe('the count badges of the bundled lines', () => {
  it('shows 999+ on a line of more than 999 calls', async () => {
    const page = await loadReaderPage(manyHtml);
    await openTab(page, 'Whole project');
    await clickBox(page, MANY);
    const line = linesOf(page).find(
      ({ from, to }) => from === `${MANY}/callers.ts` && to === `${MANY}/callees.ts`,
    );
    expect(line?.label).toBe('999+');
    expect(
      lineElementOf(page, `${MANY}/callers.ts`, `${MANY}/callees.ts`).getAttribute('aria-label'),
    ).toBe(`1024 calls from ${MANY}/callers.ts to ${MANY}/callees.ts`);
  });
});

describe('the frames and the outside boxes', () => {
  it('gives a folder frame a folder icon, and a file frame no icon', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Folder');
    await pickFolder(page, 'src/');
    const frames = [...page.window.document.querySelectorAll('#graph [data-frame]')];
    const icons = new Map(
      frames.map((frame) => [
        frame.classList.contains('folder') ? 'folder' : 'file',
        frame.querySelector('.icon')?.getAttribute('data-icon') ?? 'none',
      ]),
    );
    expect(icons).toEqual(
      new Map([
        ['folder', 'folder'],
        ['file', 'none'],
      ]),
    );
  });

  it('draws an outside function with no chip, so that it stays quieter than the boxes inside', async () => {
    const page = await loadReaderPage(folderHtml);
    await openTab(page, 'Folder');
    await pickFolder(page, 'src/tax/');
    const outside = boxesOf(page).filter(({ classes }) => classes.includes('outside'));
    expect(outside.length).toBeGreaterThan(0);
    expect(
      outside.filter(({ id }) => boxElementOf(page, id)?.querySelector('.chip') !== null),
    ).toEqual([]);
  });
});
