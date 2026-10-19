import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, git } from './fixture-repo.ts';
import {
  boxElementOf,
  boxesOf,
  callsOf,
  clickBox,
  frameAround,
  loadReaderPage,
  runCallmap,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const REPORT = 'src/report.ts';

let repo = '';
let html = '';

const reviewPage = (...flags: readonly string[]): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

beforeAll(() => {
  repo = featureBranchRepo();
  html = reviewPage();
}, 120_000);

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

const callNamesOf = (page: LoadedPage): readonly string[] =>
  callsOf(page)
    .map(({ from, to }) => `${from} -> ${to}`)
    .sort();

describe('the next hop', () => {
  it('adds the callers and the callees of a neighbour after a click on it', async () => {
    const page = await loadReaderPage(html);
    expect(boxElementOf(page, `${MONEY}#round`)).toBeUndefined();
    await clickBox(page, `${MONEY}#format`);
    expect(boxElementOf(page, `${MONEY}#round`)).toBeDefined();
    expect(boxElementOf(page, `${MONEY}#round`)?.classList.contains('neighbour')).toBe(false);
    expect(frameAround(page, `${MONEY}#round`)).toBe(MONEY);
    expect(callNamesOf(page)).toContain(`${MONEY}#format -> ${MONEY}#round`);
  });

  it('draws each call between the functions it shows once, however many times it opens', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${MONEY}#format`);
    await clickBox(page, `${CART}#subtotal`);
    await clickBox(page, `${MONEY}#format`);
    const calls = callNamesOf(page);
    expect(calls).toEqual([...new Set(calls)]);
    expect(calls.filter((call) => call.endsWith(`${MONEY}#round`))).toEqual([
      `${CART}#subtotal -> ${MONEY}#round`,
      `${MONEY}#format -> ${MONEY}#round`,
    ]);
  });

  it('places no two boxes on the same spot after it opens', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${MONEY}#format`);
    const spots = boxesOf(page).map(({ x, y }) => `${String(x)},${String(y)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });
});

const search = ({ window }: LoadedPage, text: string) => {
  const body = within(window.document.body);
  fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
    target: { value: text },
  });
  return within(body.getByRole('region', { name: 'Search' }));
};

describe('the search', () => {
  it('finds a function by a part of its name, with no regard to case', async () => {
    const results = search(await loadReaderPage(html), 'REP');
    expect(results.getAllByRole('button').map((result) => result.textContent)).toEqual([
      `report ${REPORT}`,
    ]);
  });

  it('opens a function the branch did not change with its one hop, and shows its code', async () => {
    const page = await loadReaderPage(html);
    expect(boxElementOf(page, `${REPORT}#report`)).toBeUndefined();
    fireEvent.click(search(page, 'report').getByRole('button', { name: `report ${REPORT}` }));
    await settled(page);
    expect(frameAround(page, `${REPORT}#report`)).toBe(REPORT);
    expect(callNamesOf(page)).toContain(`${REPORT}#report -> ${REPORT}#heading`);
    expect(codePanelOf(page).getByRole('heading', { name: 'report' })).toBeDefined();
    expect(page.window.document.querySelector('.code-place')?.textContent).toBe(
      `${REPORT}:3 Open in VS Code`,
    );
  });

  it('lists nothing for an empty search', async () => {
    expect(search(await loadReaderPage(html), '').queryAllByRole('button')).toEqual([]);
  });
});

describe('the editor link', () => {
  const linkOf = async (page: LoadedPage, id: string, name: string) => {
    await clickBox(page, id);
    return codePanelOf(page).getByRole('link', { name }).getAttribute('href');
  };

  it('opens the file of a function at its first line in VS Code by default', async () => {
    const root = git(repo, 'rev-parse', '--show-toplevel');
    expect(await linkOf(await loadReaderPage(html), `${CART}#receipt`, 'Open in VS Code')).toBe(
      `vscode://file${root}/${CART}:8`,
    );
  });

  it('opens the file of a function at its first line in a JetBrains editor, which counts from 0', async () => {
    const root = git(repo, 'rev-parse', '--show-toplevel');
    const page = await loadReaderPage(reviewPage('--editor', 'jetbrains'));
    expect(await linkOf(page, `${CART}#receipt`, 'Open in JetBrains')).toBe(
      `jetbrains://idea/navigate/reference?project=${basename(root)}&path=${CART}:7`,
    );
  }, 120_000);

  it('gives a removed function no editor link, because the branch no longer holds it', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#legacyTotal`);
    expect(codePanelOf(page).queryByRole('link')).toBeNull();
  });

  it('refuses an editor it does not know, and names the ones it does', () => {
    const finished = runCallmap(['review', repo, '--no-open', '--editor', 'emacs']);
    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('vscode, jetbrains');
  });
});

describe('the colours of the page', () => {
  const tokensIn = (block: string): readonly string[] =>
    [...block.matchAll(/(--[a-z-]+)\s*:/g)].map(([, token]) => token ?? '').sort();

  it('gives every colour a value for the light mode and one for the dark mode', () => {
    const light = /<style>\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
    const dark =
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(tokensIn(light)).toContain('--changed-line');
    expect(tokensIn(dark)).toEqual(tokensIn(light));
    expect(html).toMatch(/color-scheme:\s*light dark/);
  });
});
