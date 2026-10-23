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
  readonly callLimitOf?: (data: ReaderPageData) => number;
  readonly countOf?: (data: ReaderPageData) => { readonly count: number; readonly words: string };
  readonly firstChoice?: (data: ReaderPageData) => Choice;
  readonly sceneOf: (
    data: ReaderPageData,
    opened: ReadonlySet<FunctionId>,
    choice: Choice | undefined,
  ) => Scene;
  readonly choiceShowing?: (data: ReaderPageData, id: FunctionId) => Choice;
}

export interface OverLimit {
  readonly functions: number;
  readonly calls: number;
  readonly limit: number;
}

export const overLimitOf = (
  view: View,
  data: ReaderPageData,
  { boxes, lines }: Scene,
): OverLimit | undefined => {
  const limit = view.callLimitOf?.(data);
  if (limit === undefined) return undefined;
  const calls = lines.length;
  if (calls <= limit) return undefined;
  return { functions: boxes.filter(({ kind }) => kind === 'function').length, calls, limit };
};

export const openingOf = <T>(items: readonly [T, ...T[]], isOver: (item: T) => boolean): T =>
  items.find((item) => !isOver(item)) ?? items[0];
