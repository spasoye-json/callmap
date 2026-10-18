import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { GraphDocument } from '@archmap/graph-document';
import { reviewOf } from '@archmap/review';
import type { ReviewInvocation } from './arguments.ts';
import { openInBrowser } from './browser.ts';
import { extractGraph } from './extractors.ts';
import {
  commitOf,
  defaultBranchOf,
  inWorktreeAt,
  mergeBaseOf,
  repoRootOf,
  shortCommitOf,
} from './git.ts';
import { readerPageOf } from './reader-page.ts';

export class UnreadableGraphError extends Error {
  override readonly name = 'UnreadableGraphError';
}

const defaultOutOf = (root: string): string =>
  join(tmpdir(), 'archmap', `review-${basename(root)}.html`);

const readGraph = async (
  what: string,
  path: string,
  scope: readonly string[],
): Promise<GraphDocument> => {
  try {
    return await extractGraph(path, scope);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnreadableGraphError(
      `${what} could not be read: ${reason.replaceAll(`${path}/`, '')}`,
    );
  }
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
  const { scope } = invocation;
  const [branchRead, baseRead] = await Promise.allSettled([
    readGraph('the branch', root, scope),
    inWorktreeAt(root, base, (path) =>
      readGraph(`the base ${shortCommitOf(root, base)}`, path, scope),
    ),
  ]);
  const branchGraph = settled(branchRead);
  const baseGraph = settled(baseRead);
  const review = reviewOf({ base: baseGraph, branch: branchGraph });
  const html = await readerPageOf({ review, graph: branchGraph });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return out;
};
