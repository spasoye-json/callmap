import type { FunctionId } from '@archmap/graph-document';
import type { ReaderPageData } from './data.ts';
import type { FunctionBox, SceneLine } from './scene.ts';
import type { View } from './view.ts';

export interface ReaderPage {
  readonly data: ReaderPageData;
  readonly graph: HTMLElement;
  readonly panels: HTMLElement;
  readonly onBoxClick: (handler: (box: FunctionBox) => void) => void;
  readonly onLineClick: (handler: (line: SceneLine) => void) => void;
  readonly onViewChange: (handler: (view: View) => void) => void;
  readonly show: (ids: readonly FunctionId[], anchor?: FunctionId) => Promise<void>;
  readonly open: (id: FunctionId) => Promise<void>;
  readonly showView: (name: string) => Promise<void>;
  readonly pick: (choice: string) => Promise<void>;
}

export type PagePart = (page: ReaderPage) => void;
