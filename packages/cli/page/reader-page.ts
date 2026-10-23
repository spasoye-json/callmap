import type { FunctionId } from '@callmap/graph-document';
import type { FunctionMark } from '@callmap/review';
import type { Camera } from './camera.ts';
import type { ReaderPageData, Sources } from './data.ts';
import type { SelectedPath } from './highlight.ts';
import type { Laid } from './layout.ts';
import type { FunctionBox, SceneLine } from './scene.ts';
import type { Choice, OverLimit, View } from './view.ts';

export interface ReaderPage {
  readonly data: ReaderPageData;
  readonly sources: Promise<Sources>;
  readonly graph: HTMLElement;
  readonly camera: Camera;
  readonly level: () => Laid;
  readonly onLevelChange: (handler: (level: Laid) => void) => void;
  readonly panels: HTMLElement;
  readonly onBoxClick: (handler: (box: FunctionBox) => void) => void;
  readonly onLineClick: (handler: (line: SceneLine) => void) => void;
  readonly onHighlight: (handler: (path: SelectedPath) => void) => void;
  readonly onViewChange: (handler: (view: View) => void) => void;
  readonly onChoiceChange: (handler: (view: View, choice: Choice) => void) => void;
  readonly currentView: () => View;
  readonly onOverLimitChange: (handler: (over: OverLimit | undefined) => void) => void;
  readonly hiddenMarks: () => ReadonlySet<FunctionMark>;
  readonly toggleMark: (mark: FunctionMark) => void;
  readonly onHiddenMarksChange: (handler: (hidden: ReadonlySet<FunctionMark>) => void) => void;
  readonly overviewMapCollapsed: () => boolean;
  readonly toggleOverviewMap: () => void;
  readonly onOverviewMapToggle: (handler: (collapsed: boolean) => void) => void;
  readonly show: (ids: readonly FunctionId[], anchor?: FunctionId) => Promise<void>;
  readonly open: (id: FunctionId) => Promise<void>;
  readonly keepSelectionInView: () => void;
  readonly showView: (name: string) => Promise<void>;
  readonly choose: (choice: Choice) => Promise<void>;
}

export type PagePart = (page: ReaderPage) => void;
