import type { Editor } from '@archmap/editor-link';
import type { GraphDocument } from '@archmap/graph-document';
import type { Review } from '@archmap/review';

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

export interface ReaderPageData {
  readonly review: Review;
  readonly branchGraph: GraphDocument;
  readonly sources: Sources;
  readonly editor: EditorChoice;
}
