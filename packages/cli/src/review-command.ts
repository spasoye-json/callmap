import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { GraphDocument } from '@callmap/graph-document';
import { reviewOf } from '@callmap/review';
import type { ReviewInvocation } from './arguments.ts';
import { openInBrowser } from './browser.ts';
import { extractGraphDocumentOf } from './extractors.ts';
import type { ExtractorSettings } from './extractors.ts';
import {
  commitOf,
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
  settings: ExtractorSettings,
): Promise<GraphDocument> => {
  try {
    return await extractGraphDocumentOf(path, settings);
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

export const runReview = async (invocation: ReviewInvocation): Promise<string> => {
  const root = repoRootOf(resolve(invocation.repo));
  const base =
    invocation.base === undefined
      ? mergeBaseOf(root, defaultBranchOf(root))
      : commitOf(root, invocation.base);
  const settings: ExtractorSettings = {
    scope: invocation.scope,
    tsconfig: tsconfigOf(root, invocation.tsconfig),
  };
  const [branchRead, baseRead] = await Promise.allSettled([
    readGraphDocumentOf('the branch', root, settings),
    inWorktreeAt(root, base, (path) =>
      readGraphDocumentOf(`the base ${shortCommitOf(root, base)}`, path, settings),
    ),
  ]);
  const branchGraph = settled(branchRead);
  const baseGraph = settled(baseRead);
  const review = reviewOf({ base: baseGraph, branch: branchGraph });
  const html = await readerPageOf({
    review,
    branchGraph,
    sources: sourcesOf(root, base, review, branchGraph),
    basePlaces: basePlacesOf(review, baseGraph),
    editor: { name: invocation.editor, repoRoot: root },
  });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return out;
};
