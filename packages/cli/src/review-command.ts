import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { GraphDocument } from '@callmap/graph-document';
import { callGraphOf, reviewOf } from '@callmap/review';
import { DIFF_LIMIT } from '../page/views/diff.ts';
import type { ReviewInvocation } from './arguments.ts';
import { throughBaseCache } from './base-cache.ts';
import { openInBrowser } from './browser.ts';
import { TYPESCRIPT_EXTRACTOR } from './extractors.ts';
import type { Extractor, ExtractorSettings } from './extractors.ts';
import {
  commitOf,
  commonDirOf,
  defaultBranchOf,
  inWorktreeAt,
  mergeBaseOf,
  repoRootOf,
  shortCommitOf,
} from './git.ts';
import { readerPageOf } from './reader-page.ts';
import { basePlacesOf, sourcesOf } from './sources.ts';

export class UnreadableGraphError extends Error {
  override readonly name = 'UnreadableGraphError';
}

const defaultOutOf = (root: string): string =>
  join(tmpdir(), 'callmap', `review-${basename(root)}.html`);

const readGraphDocumentOf = async (
  what: string,
  path: string,
  extractor: Extractor,
  settings: ExtractorSettings,
): Promise<GraphDocument> => {
  try {
    return await extractor.extract(path, settings);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnreadableGraphError(
      `${what} could not be read: ${reason.replaceAll(`${path}/`, '')}`,
    );
  }
};

const tsconfigOf = (root: string, tsconfig: string | undefined): string | undefined => {
  if (tsconfig === undefined) return undefined;
  const absolute = resolve(root, tsconfig);
  const path = existsSync(absolute) ? realpathSync(absolute) : absolute;
  const inRepo = relative(root, path);
  return inRepo.startsWith('..') || isAbsolute(inRepo) ? path : inRepo;
};

const settled = <T>(result: PromiseSettledResult<T>): T => {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
};

export interface ReviewSettings {
  readonly diffLimit: number;
}

export interface FinishedReview {
  readonly out: string;
  readonly notes: readonly string[];
}

export const runReview = async (
  invocation: ReviewInvocation,
  { diffLimit }: ReviewSettings = { diffLimit: DIFF_LIMIT },
): Promise<FinishedReview> => {
  const root = repoRootOf(resolve(invocation.repo));
  const base =
    invocation.base === undefined
      ? mergeBaseOf(root, defaultBranchOf(root))
      : commitOf(root, invocation.base);
  const settings: ExtractorSettings = {
    scope: invocation.scope,
    tsconfig: tsconfigOf(root, invocation.tsconfig),
  };
  const readBase = (): Promise<GraphDocument> =>
    inWorktreeAt(root, base, (path) =>
      readGraphDocumentOf(
        `the base ${shortCommitOf(root, base)}`,
        path,
        TYPESCRIPT_EXTRACTOR,
        settings,
      ),
    );
  const [branchRead, baseRead] = await Promise.allSettled([
    readGraphDocumentOf('the branch', root, TYPESCRIPT_EXTRACTOR, settings),
    invocation.cache
      ? throughBaseCache(
          {
            repo: commonDirOf(root),
            checkout: root,
            commit: base,
            extractor: TYPESCRIPT_EXTRACTOR,
            ...settings,
          },
          readBase,
        )
      : readBase(),
  ]);
  const branchGraphs = [settled(branchRead)];
  const baseGraphs = [settled(baseRead)];
  const review = reviewOf({ base: baseGraphs, branch: branchGraphs });
  const branchGraph = callGraphOf(branchGraphs);
  const { html, notes } = await readerPageOf({
    review,
    branchGraph,
    sources: sourcesOf(root, base, review, branchGraph),
    basePlaces: basePlacesOf(review, callGraphOf(baseGraphs)),
    editor: { name: invocation.editor, repoRoot: root },
    diffLimit,
  });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return { out, notes };
};
