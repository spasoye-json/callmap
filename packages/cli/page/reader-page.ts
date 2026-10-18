import type { Core } from 'cytoscape';
import type { ReaderPageData } from './data.ts';

export interface ReaderPage {
  readonly data: ReaderPageData;
  readonly graph: Core;
  readonly panels: HTMLElement;
}

export type PagePart = (page: ReaderPage) => void;

declare global {
  interface Window {
    readerPage?: ReaderPage;
  }
}
