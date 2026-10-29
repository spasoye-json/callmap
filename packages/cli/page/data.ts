import type { Editor } from '@callmap/editor-link';
import type { FunctionId } from '@callmap/graph-document';
import type { CallGraph, Review } from '@callmap/review';
import type { Placement } from './layout.ts';

export const DATA_BLOCK_ID = 'reader-page-data';

export type SourceTexts = Readonly<Record<string, string>>;

export interface Sources {
  readonly branch: SourceTexts;
  readonly base: SourceTexts;
}

export interface EditorChoice {
  readonly name: Editor;
  readonly repoRoot: string;
}

export interface LineSpan {
  readonly firstLine: number;
  readonly lastLine: number;
}

export interface Checkout {
  readonly branch: string | undefined;
  readonly baseName: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly uncommitted: boolean;
}

export interface ReaderPageData {
  readonly review: Review;
  readonly branchGraph: CallGraph;
  readonly packedSources: string;
  readonly basePlaces: Readonly<Record<FunctionId, LineSpan>>;
  readonly editor: EditorChoice;
  readonly checkout: Checkout;
  readonly placements: Readonly<Partial<Record<string, Placement>>>;
  readonly diffLimit: number;
}
