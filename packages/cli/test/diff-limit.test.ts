import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { runReview } from '../src/review-command.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  loadReaderPage,
  openTab,
  pageDataOf,
  reviewHtmlOf,
  settled,
  withPageData,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const MONEY = 'src/money.ts';
const DIFF_CALLS = 11;

let repo = '';
let html = '';

beforeAll(() => {
  repo = featureBranchRepo();
  html = reviewHtmlOf(repo);
}, 120_000);

const reviewWithLimit = async (diffLimit: number) => {
  const { out, notes } = await runReview(
    {
      repo,
      base: undefined,
      scope: [],
      tsconfig: undefined,
      out: join(tempDir('callmap-out-'), 'review.html'),
      open: false,
      cache: false,
      editor: 'vscode',
    },
    { diffLimit },
  );
  return { html: readFileSync(out, 'utf8'), notes };
};

const selectedTabOf = ({ window }: LoadedPage): string =>
  within(window.document.body).getByRole('tab', { selected: true }).firstChild?.textContent ?? '';

const diffLimitMessageOf = ({ window }: LoadedPage): HTMLElement | null =>
  within(window.document.body).queryByRole('status', { name: 'Over the Diff limit' });

describe('a review over the Diff limit', () => {
  it('writes no places for the Diff view, and prints the counts and the limit to stderr', async () => {
    const over = await reviewWithLimit(DIFF_CALLS - 1);
    expect(Object.keys(pageDataOf(over.html).placements)).toEqual(['Whole project']);
    expect(over.notes).toEqual([
      'The Diff view holds 11 functions and 11 calls, over the Diff limit of 10 calls. The page opens on the Whole project view.',
    ]);
  }, 120_000);

  it('opens on the Whole project view, and the Diff tab says what it left out', async () => {
    const page = await loadReaderPage((await reviewWithLimit(DIFF_CALLS - 1)).html);
    expect(selectedTabOf(page)).toBe('Whole project');
    expect(diffLimitMessageOf(page)).toBeNull();

    await openTab(page, 'Diff');
    expect(diffLimitMessageOf(page)?.textContent).toContain(
      'This review holds 11 functions and 11 calls. The Diff view draws up to 10 calls, so it draws none of them. Open the Whole project view to read the changes level by level.',
    );
    expect(page.layouts).toEqual([]);
  }, 120_000);

  it('opens the Whole project view from the button in the message', async () => {
    const page = await loadReaderPage((await reviewWithLimit(DIFF_CALLS - 1)).html);
    await openTab(page, 'Diff');
    within(diffLimitMessageOf(page) ?? page.window.document.body)
      .getByRole('button', { name: 'Open Whole project' })
      .click();
    await settled(page);
    expect(selectedTabOf(page)).toBe('Whole project');
    expect(diffLimitMessageOf(page)).toBeNull();
  }, 120_000);

  it('hides the message at once when the reader leaves the Diff tab for a view that lays out in the page', async () => {
    const page = await loadReaderPage((await reviewWithLimit(DIFF_CALLS - 1)).html);
    await openTab(page, 'Diff');
    fireEvent.click(within(page.window.document.body).getByRole('tab', { name: 'Route' }));
    expect(diffLimitMessageOf(page)).toBeNull();
    await settled(page);
  }, 120_000);
});

describe('a review at exactly the Diff limit', () => {
  it('lays out the Diff view as before, and prints nothing', async () => {
    const atLimit = await reviewWithLimit(DIFF_CALLS);
    expect(atLimit.notes).toEqual([]);
    expect(pageDataOf(atLimit.html).placements).toEqual(pageDataOf(html).placements);
    const page = await loadReaderPage(atLimit.html);
    expect(selectedTabOf(page)).toBe('Diff');
    expect(boxesOf(page).filter(({ kind }) => kind === 'function')).toHaveLength(11);
  }, 120_000);
});

describe('a next hop that takes the Diff view over the Diff limit', () => {
  it('shows the message with the new counts, and does not lay out the Diff view', async () => {
    const page = await loadReaderPage(
      withPageData(html, { ...pageDataOf(html), diffLimit: DIFF_CALLS }),
    );
    expect(diffLimitMessageOf(page)).toBeNull();

    await clickBox(page, `${MONEY}#format`);
    expect(diffLimitMessageOf(page)?.textContent).toContain(
      'This review holds 12 functions and 13 calls. The Diff view draws up to 11 calls, so it draws none of them.',
    );
    expect(page.layouts).toEqual([]);
  });
});
