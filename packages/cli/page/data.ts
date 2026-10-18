import type { GraphDocument } from '@archmap/graph-document';
import type { Review } from '@archmap/review';

export const DATA_BLOCK_ID = 'reader-page-data';

export interface ReaderPageData {
  readonly review: Review;
  readonly graph: GraphDocument;
}
