import type { Editor } from '@archmap/editor-link';
import type { FunctionId, GraphDocument } from '@archmap/graph-document';
import type { Review } from '@archmap/review';

export const DATA_BLOCK_ID = 'reader-page-data';

export type SourceTexts = Readonly<Record<string, string>>;

export interface Sources {
  readonly branch: SourceTexts;
  readonly base: SourceTexts;
}

export type ChangedLines = Readonly<Record<FunctionId, readonly number[]>>;

export interface EditorChoice {
  readonly name: Editor;
  readonly repoRoot: string;
}

export interface ReaderPageData {
  readonly review: Review;
  readonly graph: GraphDocument;
  readonly sources: Sources;
  readonly changedLines: ChangedLines;
  readonly editor: EditorChoice;
}
