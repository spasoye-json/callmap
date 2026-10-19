import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, getAllByRole, getByRole, within } from '@testing-library/dom';
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
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';
const BROADCAST = 'src/broadcast.ts';

let html = '';
let htmlWithBroadcast = '';

const reviewPageOf = (repo: string): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'callmap-out-')), 'review.html');
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
  it('lists the open end of a call on an untyped value, with its caller, line and text', () => {
    expect(pageDataOf(html).review.openEnds).toEqual([
      { caller: `${ALERTS}#relay`, line: 8, expression: 'JSON.parse(raw).notify' },
    ]);
  });

  it('lists the one-of calls through an interface with two implementations as one group', () => {
    expect(pageDataOf(html).review.oneOfGroups).toEqual([
      {
        id: `${ALERTS}:5:27`,
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

  it('counts the calls into the repo and the open ends, and no call into a library', () => {
    expect(pageDataOf(html).review.resolutionRate).toEqual({ resolved: 9, open: 1, rate: 0.9 });
  });
});

describe('the open ends, one-of groups and resolution rate on the reader page', () => {
  it('shows the resolution rate, and says that it counts the whole repo in scope', async () => {
    const { window } = await loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    expect(rate.textContent).toContain('90.0%');
    expect(rate.textContent).toContain('In the whole repo in scope: 9 calls resolved, 1 open end.');
  });

  it('lists each open end of this review with its caller, its line and its full text', async () => {
    const { window } = await loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    const list = getByRole(rate, 'list', { name: 'In this review: 1 open end' });
    expect(getAllByRole(list, 'listitem').map((item) => item.textContent)).toEqual([
      'relay, line 8: JSON.parse(raw).notify',
    ]);
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
