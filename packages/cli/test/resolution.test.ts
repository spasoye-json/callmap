import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fireEvent, getByRole, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  linesOf,
  loadReaderPage,
  pageDataOf,
  runCallmap,
  settled,
  withPageData,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';
const BROADCAST = 'src/broadcast.ts';

const typescriptVersion = (): string => {
  const extractor = import.meta.resolve('@callmap/extractor-typescript/cli');
  const manifest = createRequire(extractor).resolve('typescript/package.json');
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
};

let html = '';
let htmlWithBroadcast = '';

const reviewPageOf = (repo: string): string => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  return readFileSync(out, 'utf8');
};

const repoWithBroadcastOnBase = (): string => {
  const repo = featureBranchRepo();
  git(repo, 'checkout', '--quiet', 'main');
  commitFile(
    repo,
    BROADCAST,
    [
      "import type { Channel } from './notify';",
      '',
      'export const broadcast = (channel: Channel, raw: string): string => {',
      '  JSON.parse(raw).notify();',
      '  return channel.send(raw);',
      '};',
      '',
    ].join('\n'),
  );
  git(repo, 'checkout', '--quiet', 'feature');
  git(repo, 'merge', '--quiet', '--no-edit', 'main');
  return repo;
};

beforeAll(() => {
  html = reviewPageOf(featureBranchRepo());
  htmlWithBroadcast = reviewPageOf(repoWithBroadcastOnBase());
}, 120_000);

describe('the open ends, one-of groups and resolution rate of callmap review', () => {
  it('lists the open end of a call on an untyped value, with its caller, line, text and reason', () => {
    expect(pageDataOf(html).review.openEnds).toEqual([
      {
        caller: `${ALERTS}#relay`,
        line: 8,
        expression: 'JSON.parse(raw).notify',
        reason: 'untyped',
      },
    ]);
  });

  it('lists the one-of calls through an interface with two implementations as one group', () => {
    expect(pageDataOf(html).review.oneOfGroups).toEqual([
      {
        id: `${ALERTS}:5:35`,
        caller: `${ALERTS}#alert`,
        line: 5,
        callees: [`${NOTIFY}#Mail.send`, `${NOTIFY}#Sms.send`],
      },
    ]);
  });

  it('ties a call inside a callback passed to map to the function that holds it', () => {
    expect(pageDataOf(html).review.calls).toContainEqual({
      caller: `${ALERTS}#alert`,
      callee: 'src/money.ts#format',
      mark: 'added',
    });
  });

  it('counts the calls into the repo and the open ends, and no call into a library, with the checker of TypeScript', () => {
    expect(pageDataOf(html).review.resolutionRates).toEqual([
      {
        language: 'typescript',
        checker: { name: 'TypeScript', version: typescriptVersion() },
        resolved: 9,
        open: 1,
        rate: 0.9,
      },
    ]);
  });
});

describe('the open ends, one-of groups and resolution rate on the reader page', () => {
  it('shows the resolution rate, and the calls that it proves of all the calls in the whole repo in scope', async () => {
    const { window } = await loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    expect(rate.textContent).toContain('90.0%');
    expect(rate.textContent).toContain('9 of 10 calls');
  });

  it('shows the rate of TypeScript next to its checker', async () => {
    const { window } = await loadReaderPage(html);
    const rate = within(getByRole(window.document.body, 'region', { name: 'Resolution rate' }));
    expect(rate.getByRole('heading', { name: 'Resolution' })).toBeDefined();
    const language = rate.getByRole('group', { name: `TypeScript ${typescriptVersion()}` });
    expect(language.querySelector('.rate')?.textContent).toBe(
      `TypeScript ${typescriptVersion()} · 90.0%`,
    );
  });

  it('shows one rate next to its checker for each language, in the order of the page data', async () => {
    const data = pageDataOf(html);
    const page = await loadReaderPage(
      withPageData(html, {
        ...data,
        review: {
          ...data.review,
          resolutionRates: [
            {
              language: 'go',
              checker: { name: 'Go', version: '1.27.3' },
              resolved: 19,
              open: 1,
              rate: 0.95,
            },
            ...data.review.resolutionRates,
          ],
        },
      }),
    );
    const rate = within(
      getByRole(page.window.document.body, 'region', { name: 'Resolution rate' }),
    );
    expect(
      rate.getAllByRole('group').map((language) => language.querySelector('.rate')?.textContent),
    ).toEqual(['Go 1.27.3 · 95.0%', `TypeScript ${typescriptVersion()} · 90.0%`]);
    expect(rate.getByRole('group', { name: 'Go 1.27.3' }).textContent).toContain('19 of 20 calls');
  });

  it('lists the open ends of this review by the file of their caller, with the line and the reason of each', async () => {
    const { window } = await loadReaderPage(html);
    const openEnds = within(getByRole(window.document.body, 'region', { name: 'Open ends' }));
    const file = openEnds.getByRole('button', { name: `${ALERTS} 1` });
    expect(file.getAttribute('aria-expanded')).toBe('true');
    expect(
      openEnds.getByRole('button', { name: 'JSON.parse(raw).notify line 8 · untyped value' }),
    ).toBeDefined();

    fireEvent.click(file);
    expect(file.getAttribute('aria-expanded')).toBe('false');
    expect(
      openEnds.queryByRole('button', { name: 'JSON.parse(raw).notify line 8 · untyped value' }),
    ).toBeNull();
  });

  it('selects the caller of an open end after a click on it', async () => {
    const page = await loadReaderPage(html);
    const body = within(page.window.document.body);
    const openEnds = within(body.getByRole('region', { name: 'Open ends' }));
    fireEvent.click(
      openEnds.getByRole('button', { name: 'JSON.parse(raw).notify line 8 · untyped value' }),
    );
    await settled(page);
    expect(
      within(body.getByRole('region', { name: 'Code' })).getByRole('heading', { name: 'relay' }),
    ).toBeDefined();
  });

  it('shows the 5 files with the most open ends first, and the others after a click on "Show 3 more files"', async () => {
    const data = pageDataOf(html);
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const openEnds = files.flatMap((name, index) =>
      Array.from({ length: (index % 3) + 1 }, (_, line) => ({
        caller: `src/${name}.ts#run`,
        line: line + 1,
        expression: `${name}.go`,
        reason: 'other' as const,
      })),
    );
    const callers = files.map((name) => ({
      id: `src/${name}.ts#run`,
      name: 'run',
      file: `src/${name}.ts`,
      firstLine: 1,
      lastLine: 3,
      sourceHash: name,
    }));
    const page = await loadReaderPage(
      withPageData(html, {
        ...data,
        branchGraph: {
          ...data.branchGraph,
          functions: [...data.branchGraph.functions, ...callers],
        },
        review: { ...data.review, openEnds },
      }),
    );
    const region = within(page.window.document.body).getByRole('region', { name: 'Open ends' });
    const fileNames = (): readonly string[] =>
      [...region.querySelectorAll('[aria-expanded]')].map((button) => button.textContent);
    expect(fileNames()).toEqual([
      'src/c.ts 3',
      'src/f.ts 3',
      'src/b.ts 2',
      'src/e.ts 2',
      'src/h.ts 2',
    ]);

    fireEvent.click(within(region).getByRole('button', { name: 'Show 3 more files' }));
    expect(fileNames().slice(5)).toEqual(['src/a.ts 1', 'src/d.ts 1', 'src/g.ts 1']);
    expect(within(region).queryByRole('button', { name: /^Show/ })).toBeNull();
  });

  it.each([
    ['missing-module', 'code not found'],
    ['dynamic-key', 'dynamic key'],
    ['untyped', 'untyped value'],
    ['function-value', 'function value'],
    ['no-implementation', 'no implementation in scope'],
    ['other', 'not resolved'],
  ] as const)('shows the open-end reason %s as "%s"', async (reason, words) => {
    const data = pageDataOf(html);
    const openEnds = data.review.openEnds.map((openEnd) => ({ ...openEnd, reason }));
    const page = await loadReaderPage(
      withPageData(html, { ...data, review: { ...data.review, openEnds } }),
    );
    const region = within(page.window.document.body).getByRole('region', { name: 'Open ends' });
    expect(
      within(region).getByRole('button', { name: `JSON.parse(raw).notify line 8 · ${words}` }),
    ).toBeDefined();
  });

  it('marks each open end at its call site, as an arrow from its caller that leads nowhere', async () => {
    const page = await loadReaderPage(html);
    const ends = boxesOf(page).filter(({ kind }) => kind === 'open-end');
    expect(ends.map(({ label }) => label)).toEqual(['JSON.parse(raw).notify :8']);
    expect(
      linesOf(page)
        .filter(({ to }) => ends.some(({ id }) => id === to))
        .map(({ from }) => from),
    ).toEqual([`${ALERTS}#relay`]);
  });

  it('draws the calls of a one-of group as alternatives of one group', async () => {
    const alternatives = linesOf(await loadReaderPage(html)).filter(({ classes }) =>
      classes.includes('one-of'),
    );
    expect(alternatives.map(({ to }) => to).sort()).toEqual([
      `${NOTIFY}#Mail.send`,
      `${NOTIFY}#Sms.send`,
    ]);
    expect(alternatives.map(({ label }) => label)).toEqual(['one of 2', 'one of 2']);
  });

  const openEndsFrom = (page: LoadedPage, caller: string): readonly string[] => {
    const labels = new Map(boxesOf(page).map(({ id, label }) => [id, label]));
    return linesOf(page)
      .filter(({ from, classes }) => from === caller && classes.includes('open-end'))
      .map(({ to }) => labels.get(to) ?? '');
  };

  it('marks the open ends and the one-of calls of a function that the next hop adds', async () => {
    const page = await loadReaderPage(htmlWithBroadcast);
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual([]);
    await clickBox(page, `${NOTIFY}#Mail.send`);
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual(['JSON.parse(raw).notify :4']);
    const alternatives = linesOf(page)
      .filter(({ classes }) => classes.includes('one-of'))
      .map(({ from, to }) => `${from} -> ${to}`)
      .filter((call) => call.startsWith(`${BROADCAST}#broadcast `));
    expect(alternatives.sort()).toEqual([
      `${BROADCAST}#broadcast -> ${NOTIFY}#Mail.send`,
      `${BROADCAST}#broadcast -> ${NOTIFY}#Sms.send`,
    ]);
  });

  it('marks the open ends of a function that the search opens', async () => {
    const page = await loadReaderPage(htmlWithBroadcast);
    const body = within(page.window.document.body);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'broadcast' },
    });
    fireEvent.click(body.getByRole('button', { name: `broadcast ${BROADCAST}` }));
    await settled(page);
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual(['JSON.parse(raw).notify :4']);
  });
});
