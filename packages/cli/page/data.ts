import type { Editor } from '@callmap/editor-link';
import type { FunctionId, GraphDocument } from '@callmap/graph-document';
import type { Review } from '@callmap/review';
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

export interface ReaderPageData {
  readonly review: Review;
  readonly branchGraph: GraphDocument;
  readonly sources: Sources;
  readonly basePlaces: Readonly<Record<FunctionId, LineSpan>>;
  readonly editor: EditorChoice;
  readonly placements: Readonly<Partial<Record<string, Placement>>>;
}
