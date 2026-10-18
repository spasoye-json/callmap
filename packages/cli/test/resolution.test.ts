import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, getAllByRole, getByRole, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import { loadReaderPage, pageDataOf, runArchmap } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';
const BROADCAST = 'src/broadcast.ts';

let html = '';
let htmlWithBroadcast = '';

const reviewPageOf = (repo: string): string => {
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out]);
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

describe('the open ends, one-of groups and resolution rate of archmap review', () => {
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
  it('shows the resolution rate, and says that it counts the whole repo in scope', () => {
    const { window } = loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    expect(rate.textContent).toContain('90.0%');
    expect(rate.textContent).toContain('In the whole repo in scope: 9 calls resolved, 1 open end.');
  });

  it('lists each open end of this review with its caller, its line and its full text', () => {
    const { window } = loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    const list = getByRole(rate, 'list', { name: 'In this review: 1 open end' });
    expect(getAllByRole(list, 'listitem').map((item) => item.textContent)).toEqual([
      'relay, line 8: JSON.parse(raw).notify',
    ]);
  });

  it('marks each open end at its call site, as an arrow from its caller that leads nowhere', () => {
    const { graph } = loadReaderPage(html);
    const ends = graph.nodes('.open-end');
    expect(ends.map((end) => end.data('label') as string)).toEqual(['JSON.parse(raw).notify :8']);
    expect(ends.connectedEdges().map((arrow) => arrow.source().id())).toEqual([`${ALERTS}#relay`]);
  });

  it('draws the calls of a one-of group as alternatives of one group', () => {
    const { graph } = loadReaderPage(html);
    const alternatives = graph.edges('.one-of');
    expect(alternatives.map((arrow) => arrow.target().id()).sort()).toEqual([
      `${NOTIFY}#Mail.send`,
      `${NOTIFY}#Sms.send`,
    ]);
    expect(alternatives.map((arrow) => arrow.data('label') as string)).toEqual([
      'one of 2',
      'one of 2',
    ]);
  });

  const openEndsFrom = ({ graph }: LoadedPage, caller: string): readonly string[] =>
    graph
      .edges('.open-end')
      .map((arrow) => ({
        from: arrow.source().id(),
        label: arrow.target().data('label') as string,
      }))
      .filter(({ from }) => from === caller)
      .map(({ label }) => label);

  it('marks the open ends and the one-of calls of a function that the next hop adds', () => {
    const page = loadReaderPage(htmlWithBroadcast);
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual([]);
    page.graph.getElementById(`${NOTIFY}#Mail.send`).emit('tap');
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual(['JSON.parse(raw).notify :4']);
    const alternatives = page.graph
      .edges('.one-of')
      .map((arrow) => `${arrow.source().id()} -> ${arrow.target().id()}`)
      .filter((call) => call.startsWith(`${BROADCAST}#broadcast `));
    expect(alternatives.sort()).toEqual([
      `${BROADCAST}#broadcast -> ${NOTIFY}#Mail.send`,
      `${BROADCAST}#broadcast -> ${NOTIFY}#Sms.send`,
    ]);
  });

  it('marks the open ends of a function that the search opens', () => {
    const page = loadReaderPage(htmlWithBroadcast);
    const body = within(page.window.document.body);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'broadcast' },
    });
    fireEvent.click(body.getByRole('button', { name: `broadcast ${BROADCAST}` }));
    expect(openEndsFrom(page, `${BROADCAST}#broadcast`)).toEqual(['JSON.parse(raw).notify :4']);
  });
});
