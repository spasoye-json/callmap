import type { FunctionId } from '@archmap/graph-document';
import type { ReaderPageData } from './data.ts';
import type { Scene } from './scene.ts';

export interface View {
  readonly name: string;
  readonly zoomLevels?: boolean;
  readonly sceneOf: (data: ReaderPageData, opened: ReadonlySet<FunctionId>) => Scene;
}
