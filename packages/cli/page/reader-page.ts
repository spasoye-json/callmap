import type { FunctionId } from '@archmap/graph-document';
import type { ReaderPageData } from './data.ts';
import type { FunctionBox } from './scene.ts';

export interface ReaderPage {
  readonly data: ReaderPageData;
  readonly graph: HTMLElement;
  readonly panels: HTMLElement;
  readonly onBoxClick: (handler: (box: FunctionBox) => void) => void;
  readonly show: (ids: readonly FunctionId[], anchor?: FunctionId) => Promise<void>;
  readonly open: (id: FunctionId) => Promise<void>;
}

export type PagePart = (page: ReaderPage) => void;
