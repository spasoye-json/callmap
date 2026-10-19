import type { FunctionId } from '@callmap/graph-document';
import type { ReaderPageData } from './data.ts';
import type { Scene } from './scene.ts';

export type Choice =
  | { readonly kind: 'folder'; readonly folder: string }
  | { readonly kind: 'tree'; readonly from: FunctionId };

export const choiceKeyOf = (choice: Choice): string =>
  choice.kind === 'folder' ? `folder:${choice.folder}` : `tree:${choice.from}`;

export interface View {
  readonly name: string;
  readonly zoomLevels?: boolean;
  readonly laidOutByCommand?: boolean;
  readonly sceneOf: (
    data: ReaderPageData,
    opened: ReadonlySet<FunctionId>,
    choice: Choice | undefined,
  ) => Scene;
  readonly choiceShowing?: (data: ReaderPageData, id: FunctionId) => Choice;
}
