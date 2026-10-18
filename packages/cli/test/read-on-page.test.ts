import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, fixtureText, git } from './fixture-repo.ts';
import { loadReaderPage, runArchmap } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const REPORT = 'src/report.ts';

let repo = '';
let html = '';

const reviewPage = (...flags: readonly string[]): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

beforeAll(() => {
  repo = featureBranchRepo();
  html = reviewPage();
}, 120_000);

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

describe('the code panel', () => {
  it('shows the code of a box after a click on it', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${CART}#taxed`).emit('tap');
    const panel = codePanelOf(page);
    expect(panel.getByRole('heading', { name: 'taxed' })).toBeDefined();
    expect(
      panel.getByText(
        'export const taxed = (prices: readonly number[]): number => subtotal(prices) * 1.25;',
      ),
    ).toBeDefined();
    expect(panel.queryByText(/export const subtotal/)).toBeNull();
  });

  it('shows the code of a removed function as the base held it', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${CART}#legacyTotal`).emit('tap');
    expect(
      codePanelOf(page).getByText(
        'export const legacyTotal = (prices: readonly number[]): number => subtotal(prices) * 1.2;',
      ),
    ).toBeDefined();
  });

  it('marks the lines that the branch changed inside a changed function, and no others', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${CART}#receipt`).emit('tap');
    const panel = codePanelOf(page);
    expect(panel.getAllByRole('insertion').map((line) => line.textContent)).toEqual([
      '9  const total = taxed(prices);',
      '10  return format(total);',
    ]);
    expect(panel.getByText('};').closest('ins')).toBeNull();
  });

  it('marks the line below a deletion inside a changed function', () => {
    const deletion = featureBranchRepo();
    const cart = (extra: string): string =>
      fixtureText('branch', CART).replace(
        '  return format(total);',
        `${extra}  return format(total);`,
      );
    commitFile(deletion, CART, cart('  console.log(total);\n'));
    commitFile(deletion, CART, cart(''));
    const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
    const finished = runArchmap([
      'review',
      deletion,
      '--no-open',
      '--out',
      out,
      '--base',
      'HEAD~1',
    ]);
    expect(finished.status, finished.stderr).toBe(0);

    const page = loadReaderPage(readFileSync(out, 'utf8'));
    page.graph.getElementById(`${CART}#receipt`).emit('tap');
    const panel = codePanelOf(page);
    expect(
      panel
        .getAllByTitle('The branch removed lines above this line.')
        .map((line) => line.textContent),
    ).toEqual(['10  return format(total);']);
    expect(panel.queryAllByRole('insertion')).toEqual([]);
  }, 60_000);
});

const callsOf = ({ graph }: LoadedPage): readonly string[] =>
  graph
    .edges()
    .map((edge) => `${edge.source().id()} -> ${edge.target().id()}`)
    .sort();

describe('the next hop', () => {
  it('adds the callers and the callees of a neighbour after a click on it', () => {
    const page = loadReaderPage(html);
    expect(page.graph.getElementById(`${MONEY}#round`).length).toBe(0);
    page.graph.getElementById(`${MONEY}#format`).emit('tap');
    const round = page.graph.getElementById(`${MONEY}#round`);
    expect(round.hasClass('neighbour')).toBe(true);
    expect(round.parent().data('label')).toBe(MONEY);
    expect(callsOf(page)).toContain(`${MONEY}#format -> ${MONEY}#round`);
  });

  it('draws each call between the functions it shows once, however many times it opens', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${MONEY}#format`).emit('tap');
    page.graph.getElementById(`${CART}#subtotal`).emit('tap');
    page.graph.getElementById(`${MONEY}#format`).emit('tap');
    const calls = callsOf(page);
    expect(calls).toEqual([...new Set(calls)]);
    expect(calls.filter((call) => call.endsWith(`${MONEY}#round`))).toEqual([
      `${CART}#subtotal -> ${MONEY}#round`,
      `${MONEY}#format -> ${MONEY}#round`,
    ]);
  });

  it('places no two boxes on the same spot after it opens', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${MONEY}#format`).emit('tap');
    const spots = page.graph
      .nodes('.function')
      .map((box) => `${String(box.position('x'))},${String(box.position('y'))}`);
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
  it('finds a function by a part of its name, with no regard to case', () => {
    const results = search(loadReaderPage(html), 'REP');
    expect(results.getAllByRole('button').map((result) => result.textContent)).toEqual([
      `report ${REPORT}`,
    ]);
  });

  it('opens a function the branch did not change with its one hop, and shows its code', () => {
    const page = loadReaderPage(html);
    expect(page.graph.getElementById(`${REPORT}#report`).length).toBe(0);
    fireEvent.click(search(page, 'report').getByRole('button', { name: `report ${REPORT}` }));
    expect(page.graph.getElementById(`${REPORT}#report`).parent().data('label')).toBe(REPORT);
    expect(callsOf(page)).toContain(`${REPORT}#report -> ${REPORT}#heading`);
    expect(codePanelOf(page).getByRole('heading', { name: 'report' })).toBeDefined();
  });

  it('lists nothing for an empty search', () => {
    expect(search(loadReaderPage(html), '').queryAllByRole('button')).toEqual([]);
  });
});

describe('the editor link', () => {
  const linkOf = (page: LoadedPage, id: string, name: string) => {
    page.graph.getElementById(id).emit('tap');
    return codePanelOf(page).getByRole('link', { name }).getAttribute('href');
  };

  it('opens the file of a function at its first line in VS Code by default', () => {
    const root = git(repo, 'rev-parse', '--show-toplevel');
    expect(linkOf(loadReaderPage(html), `${CART}#receipt`, 'Open in VS Code')).toBe(
      `vscode://file${root}/${CART}:8`,
    );
  });

  it('opens the file of a function at its first line in a JetBrains editor, which counts from 0', () => {
    const root = git(repo, 'rev-parse', '--show-toplevel');
    const page = loadReaderPage(reviewPage('--editor', 'jetbrains'));
    expect(linkOf(page, `${CART}#receipt`, 'Open in JetBrains')).toBe(
      `jetbrains://idea/navigate/reference?project=${basename(root)}&path=${CART}:7`,
    );
  }, 120_000);

  it('gives a removed function no editor link, because the branch no longer holds it', () => {
    const page = loadReaderPage(html);
    page.graph.getElementById(`${CART}#legacyTotal`).emit('tap');
    expect(codePanelOf(page).queryByRole('link')).toBeNull();
  });

  it('refuses an editor it does not know, and names the ones it does', () => {
    const finished = runArchmap(['review', repo, '--no-open', '--editor', 'emacs']);
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
