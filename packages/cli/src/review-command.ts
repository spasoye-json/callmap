import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { reviewOf } from '@archmap/review';
import type { ReviewInvocation } from './arguments.ts';
import { openInBrowser } from './browser.ts';
import { extractGraph } from './extractors.ts';
import { defaultBranchOf, inWorktreeAt, mergeBaseOf, repoRootOf } from './git.ts';
import { readerPageOf } from './reader-page.ts';

const defaultOutOf = (root: string): string =>
  join(tmpdir(), 'archmap', `review-${basename(root)}.html`);

export const runReview = async (invocation: ReviewInvocation): Promise<string> => {
  const root = repoRootOf(resolve(invocation.repo));
  const base = mergeBaseOf(root, defaultBranchOf(root));
  const [branchGraph, baseGraph] = await Promise.all([
    extractGraph(root),
    inWorktreeAt(root, base, extractGraph),
  ]);
  const review = reviewOf({ base: baseGraph, branch: branchGraph });
  const html = await readerPageOf({ review, graph: branchGraph });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return out;
};
