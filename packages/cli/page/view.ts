import type { FunctionId } from '@callmap/graph-document';
import type { ReaderPageData } from './data.ts';
import type { Scene } from './scene.ts';

export type Choice =
  | { readonly kind: 'folder'; readonly folder: string }
  | { readonly kind: 'tree'; readonly from: FunctionId }
  | { readonly kind: 'level'; readonly path: string };

export const choiceKeyOf = (choice: Choice): string => {
  switch (choice.kind) {
    case 'folder':
      return `folder:${choice.folder}`;
    case 'tree':
      return `tree:${choice.from}`;
    case 'level':
      return `level:${choice.path}`;
  }
};

export interface View {
  readonly name: string;
  readonly laidOutByCommand?: boolean;
  readonly firstChoice?: (data: ReaderPageData) => Choice;
  readonly sceneOf: (
    data: ReaderPageData,
    opened: ReadonlySet<FunctionId>,
    choice: Choice | undefined,
  ) => Scene;
  readonly choiceShowing?: (data: ReaderPageData, id: FunctionId) => Choice;
}
