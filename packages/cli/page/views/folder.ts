import type { FunctionId } from '@archmap/graph-document';
import { byText } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { markedCallsOf, markedFunctionsOf } from '../functions.ts';
import { foldersAbove, nestedSceneOf } from '../nested-scene.ts';
import type { View } from '../view.ts';

export const foldersOf = (data: ReaderPageData): readonly string[] =>
  [
    ...new Set([...markedFunctionsOf(data).values()].flatMap(({ file }) => foldersAbove(file))),
  ].sort(byText);

const holds = (folder: string | undefined, file: string): boolean =>
  folder !== undefined && file.startsWith(`${folder}/`);

export const folderView: View = {
  name: 'Folder',
  sceneOf: (data, opened, folder) => {
    const functions = [...markedFunctionsOf(data).values()];
    const calls = markedCallsOf(data);
    const inside = new Set(functions.filter(({ file }) => holds(folder, file)).map(({ id }) => id));
    const shown = new Set<FunctionId>([...inside, ...opened]);
    for (const { caller, callee } of calls) {
      if (inside.has(caller)) shown.add(callee);
      if (inside.has(callee)) shown.add(caller);
    }
    return nestedSceneOf(
      data,
      functions.filter(({ id }) => shown.has(id)),
      calls.filter(({ caller, callee }) => shown.has(caller) && shown.has(callee)),
    );
  },
};
