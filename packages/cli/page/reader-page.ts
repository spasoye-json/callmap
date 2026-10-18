import type { Core, EventObject, StylesheetJson } from 'cytoscape';
import type { ReaderPageData } from './data.ts';
import type { Colours } from './graph-style.ts';

export type GraphStyle = (colours: Colours) => StylesheetJson;

export interface ReaderPage {
  readonly data: ReaderPageData;
  readonly graph: Core;
  readonly panels: HTMLElement;
  readonly addGraphStyle: (style: GraphStyle) => void;
}

export type PagePart = (page: ReaderPage) => void;

export const targetIdOf = (event: EventObject): string =>
  (event.target as { id: () => string }).id();

declare global {
  interface Window {
    readerPage?: ReaderPage;
  }
}
