import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { inWorktreeAt } from '../src/git.ts';
import { commitFile, featureBranchRepo, git } from './fixture-repo.ts';
import {
  boxesOf,
  loadReaderPage,
  openTab,
  pageDataOf,
  runCallmap,
  settled,
} from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const MONEY = 'src/money.ts';
const CART = 'src/cart.ts';

const BRANCH_CHANGES = {
  [`${CART}#legacyTotal`]: 'removed',
  [`${CART}#receipt`]: 'changed',
  [`${CART}#taxed`]: 'added',
};

const marksOfReview = (repo: string, ...flags: readonly string[]) => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(['review', repo, '--no-open', '--out', out, ...flags]);
  expect(finished.status, finished.stderr).toBe(0);
  return Object.fromEntries(
    pageDataOf(readFileSync(out, 'utf8')).review.functions.map(({ id, mark }) => [id, mark]),
  );
};

describe('the base of a review', () => {
  it('reviews the branch against the commit that --base names', () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      MONEY,
      `${readFileSync(join(repo, MONEY), 'utf8')}\nexport const half = (amount: number): number => amount / 2;\n`,
    );
    expect(marksOfReview(repo, '--base', 'HEAD~1')).toEqual({ [`${MONEY}#half`]: 'added' });
  }, 60_000);

  it('takes the merge base with the head of the remote before main', () => {
    const repo = featureBranchRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/trunk', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    git(repo, 'branch', '--force', 'main', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the merge base with the head of another remote when origin names no head', () => {
    const repo = featureBranchRepo();
    git(repo, 'remote', 'add', 'upstream', repo);
    git(repo, 'update-ref', 'refs/remotes/upstream/trunk', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/trunk');
    git(repo, 'branch', '--force', 'main', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the head of origin before the head of another remote', () => {
    const repo = featureBranchRepo();
    git(repo, 'remote', 'add', 'origin', repo);
    git(repo, 'remote', 'add', 'another', repo);
    git(repo, 'update-ref', 'refs/remotes/origin/trunk', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    git(repo, 'update-ref', 'refs/remotes/another/trunk', 'feature');
    git(repo, 'symbolic-ref', 'refs/remotes/another/HEAD', 'refs/remotes/another/trunk');
    git(repo, 'branch', '--force', 'main', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the merge base with main when the remote names no head', () => {
    const repo = featureBranchRepo();
    git(repo, 'branch', 'master', 'feature');
    expect(marksOfReview(repo)).toMatchObject(BRANCH_CHANGES);
  }, 60_000);

  it('takes the merge base with master when there is no main', () => {
    expect(marksOfReview(featureBranchRepo('master'))).toMatchObject(BRANCH_CHANGES);
  }, 60_000);
});

describe('the base checkout of a review', () => {
  it('resolves library types from the node_modules of the working tree', () => {
    const repo = featureBranchRepo();
    mkdirSync(join(repo, 'node_modules/shapes'), { recursive: true });
    writeFileSync(join(repo, 'node_modules/shapes/package.json'), '{ "name": "shapes" }\n');
    writeFileSync(
      join(repo, 'node_modules/shapes/index.d.ts'),
      'export declare const area: (side: number) => number;\n',
    );
    commitFile(repo, '.gitignore', 'node_modules/\n');
    commitFile(
      repo,
      'src/area.ts',
      "import { area } from 'shapes';\n\nexport const legacyArea = (): number => area(2);\n",
    );
    git(repo, 'rm', '--quiet', 'src/area.ts');
    git(repo, 'commit', '--quiet', '--message', 'remove src/area.ts');

    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = runCallmap(['review', repo, '--no-open', '--out', out, '--base', 'HEAD~1']);
    expect(finished.status, finished.stderr).toBe(0);
    const { review } = pageDataOf(readFileSync(out, 'utf8'));
    expect(review.functions.map(({ id, mark }) => [id, mark])).toEqual([
      ['src/area.ts#legacyArea', 'removed'],
    ]);
    expect(review.openEnds).toEqual([]);
    expect(git(repo, 'status', '--porcelain', '--ignored')).toBe('!! node_modules/');
  }, 60_000);

  it('holds the go.work and go.work.sum of the repo root that git ignores or does not track, and no other ignored file', async () => {
    const repo = featureBranchRepo();
    commitFile(repo, '.gitignore', 'go.work\n.env\n');
    writeFileSync(join(repo, 'go.work'), 'go 1.22\n\nuse .\n');
    writeFileSync(join(repo, 'go.work.sum'), '');
    writeFileSync(join(repo, '.env'), 'TOKEN=1\n');
    const seen = await inWorktreeAt(repo, git(repo, 'rev-parse', 'HEAD'), (path) =>
      Promise.resolve({
        goWork: readFileSync(join(path, 'go.work'), 'utf8'),
        goWorkSum: existsSync(join(path, 'go.work.sum')),
        env: existsSync(join(path, '.env')),
      }),
    );
    expect(seen).toEqual({ goWork: 'go 1.22\n\nuse .\n', goWorkSum: true, env: false });
  });
});

describe('a branch that changed no function', () => {
  it('gets a page that says so in place of an empty graph', async () => {
    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = runCallmap([
      'review',
      featureBranchRepo(),
      '--no-open',
      '--out',
      out,
      '--base',
      'HEAD',
    ]);
    expect(finished.status, finished.stderr).toBe(0);

    const page = await loadReaderPage(readFileSync(out, 'utf8'));
    const { window } = page;
    const body = within(window.document.body);
    const message = within(body.getByRole('status', { name: 'No changed functions' }));
    expect(message.getByText('The branch changes no function against its base.')).toBeDefined();
    expect(window.document.getElementById('graph')?.hidden).toBe(true);
    expect(boxesOf(page)).toHaveLength(0);

    fireEvent.click(message.getByRole('button', { name: 'Open Whole project' }));
    await settled(page);
    expect(body.getByRole('tab', { selected: true }).textContent).toBe('Whole project');
    expect(window.document.getElementById('graph')?.hidden).toBe(false);
    expect(body.queryByRole('status', { name: 'No changed functions' })).toBeNull();
    expect(boxesOf(page).length).toBeGreaterThan(0);

    await openTab(page, 'Diff');
    expect(body.getByRole('status', { name: 'No changed functions' })).toBeDefined();
    expect(window.document.getElementById('graph')?.hidden).toBe(true);
  }, 60_000);
});
