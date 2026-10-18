import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAllByRole, getByRole } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { loadReaderPage, pageDataOf, runArchmap } from './reader-page.ts';

const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';

let html = '';

beforeAll(() => {
  const repo = featureBranchRepo();
  const out = join(mkdtempSync(join(tmpdir(), 'archmap-out-')), 'review.html');
  const finished = runArchmap(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  html = readFileSync(out, 'utf8');
}, 120_000);

describe('the honest edges of archmap review', () => {
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

describe('the honest edges on the reader page', () => {
  it('shows the resolution rate', () => {
    const { window } = loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    expect(rate.textContent).toContain('90.0%');
    expect(rate.textContent).toContain('9 calls resolved');
    expect(rate.textContent).toContain('1 open end');
  });

  it('lists each open end with its caller, its line and its full text', () => {
    const { window } = loadReaderPage(html);
    const rate = getByRole(window.document.body, 'region', { name: 'Resolution rate' });
    expect(getAllByRole(rate, 'listitem').map((item) => item.textContent)).toEqual([
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
});
