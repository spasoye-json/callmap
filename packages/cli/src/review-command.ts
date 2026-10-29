import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { GraphDocument } from '@callmap/graph-document';
import { reviewGraphsOf, reviewOf } from '@callmap/review';
import { inScope, isSkippedDirectory } from '@callmap/scope';
import { DIFF_LIMIT } from '../page/views/diff.ts';
import type { Checkout } from '../page/data.ts';
import type { ReviewInvocation } from './arguments.ts';
import { throughBaseCache } from './base-cache.ts';
import { openInBrowser } from './browser.ts';
import { extractorsFor } from './extractors.ts';
import type { Extractor } from './extractors.ts';
import {
  branchNameOf,
  commitOf,
  commonDirOf,
  defaultBranchOf,
  filesAtCommit,
  inWorktreeAt,
  mergeBaseOf,
  repoRootOf,
  shortCommitOf,
  uncommittedFilesOf,
  workingTreeFilesOf,
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
  scope: readonly string[],
): Promise<GraphDocument> => {
  try {
    return await extractor.extract(path, scope);
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

const inSkippedDirectory = (path: string): boolean =>
  path.split('/').slice(0, -1).some(isSkippedDirectory);

const isInReviewScope = (path: string, scope: readonly string[]): boolean =>
  !inSkippedDirectory(path) && inScope(path, scope);

const extractorsInScope = (
  extractors: readonly Extractor[],
  files: readonly string[],
  scope: readonly string[],
): readonly Extractor[] => {
  const inScopeFiles = files.filter((path) => isInReviewScope(path, scope));
  return extractors.filter((extractor) => extractor.claimsAnyOf(inScopeFiles, files));
};

interface Base {
  readonly name: string;
  readonly commit: string;
}

const baseOf = (root: string, typed: string | undefined): Base => {
  if (typed !== undefined) return { name: typed, commit: commitOf(root, typed) };
  const name = defaultBranchOf(root);
  return { name, commit: mergeBaseOf(root, name) };
};

const checkoutOf = (root: string, base: Base, scope: readonly string[]): Checkout => ({
  branch: branchNameOf(root),
  baseName: base.name,
  baseCommit: shortCommitOf(root, base.commit),
  headCommit: shortCommitOf(root, 'HEAD'),
  uncommitted: uncommittedFilesOf(root).some((path) => isInReviewScope(path, scope)),
});

interface LanguageDocuments {
  readonly branch: GraphDocument;
  readonly base: GraphDocument;
}

export interface ReviewSettings {
  readonly diffLimit: number;
  readonly extractors?: readonly Extractor[];
}

export interface FinishedReview {
  readonly out: string;
  readonly notes: readonly string[];
}

export const runReview = async (
  invocation: ReviewInvocation,
  { diffLimit, extractors }: ReviewSettings = { diffLimit: DIFF_LIMIT },
): Promise<FinishedReview> => {
  const root = repoRootOf(resolve(invocation.repo));
  const reviewBase = baseOf(root, invocation.base);
  const base = reviewBase.commit;
  const { scope } = invocation;
  const documentsOf = async (extractor: Extractor): Promise<LanguageDocuments> => {
    const readBranch = (): Promise<GraphDocument> =>
      readGraphDocumentOf('the branch', root, extractor, scope);
    const readBase = (): Promise<GraphDocument> =>
      inWorktreeAt(root, base, (path) =>
        readGraphDocumentOf(`the base ${shortCommitOf(root, base)}`, path, extractor, scope),
      );
    const readCachedBase = (): Promise<GraphDocument> =>
      invocation.cache
        ? throughBaseCache(
            { repo: commonDirOf(root), checkout: root, commit: base, scope, extractor },
            readBase,
          )
        : readBase();
    if (!extractor.readsInParallel) {
      const branch = await readBranch();
      return { branch, base: await readCachedBase() };
    }
    const [branchRead, baseRead] = await Promise.allSettled([readBranch(), readCachedBase()]);
    return { branch: settled(branchRead), base: settled(baseRead) };
  };

  const picked = extractorsInScope(
    extractors ?? extractorsFor(tsconfigOf(root, invocation.tsconfig)),
    [...workingTreeFilesOf(root), ...filesAtCommit(root, base)],
    scope,
  );
  const checked = picked.map((extractor) => ({ extractor, skipNote: extractor.skipNote?.() }));
  const read: LanguageDocuments[] = [];
  for (const { extractor } of checked.filter(({ skipNote }) => skipNote === undefined)) {
    read.push(await documentsOf(extractor));
  }
  const graphs = reviewGraphsOf({
    base: read.map(({ base }) => base),
    branch: read.map(({ branch }) => branch),
  });
  const review = reviewOf(graphs);
  const { html, notes } = await readerPageOf({
    review,
    branchGraph: graphs.branch,
    sources: sourcesOf(root, base, review, graphs.branch),
    basePlaces: basePlacesOf(review, graphs.base),
    editor: { name: invocation.editor, repoRoot: root },
    checkout: checkoutOf(root, reviewBase, scope),
    diffLimit,
  });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return {
    out,
    notes: [
      ...checked.flatMap(({ skipNote }) => skipNote ?? []),
      ...checked.flatMap(({ extractor }) => extractor.notes?.() ?? []),
      ...notes,
    ],
  };
};
