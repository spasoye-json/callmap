import type { FunctionId } from '@archmap/graph-document';
import { byText } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { markedCallsOf, pageFunctionsOf } from '../functions.ts';
import { foldersAbove, nestedSceneOf } from '../nested-scene.ts';
import type { View } from '../view.ts';

export const foldersOf = (data: ReaderPageData): readonly string[] =>
  [...new Set([...pageFunctionsOf(data).values()].flatMap(({ file }) => foldersAbove(file)))].sort(
    byText,
  );

const holds = (folder: string | undefined, file: string): boolean =>
  folder !== undefined && file.startsWith(`${folder}/`);

export const folderView: View = {
  name: 'Folder',
  sceneOf: (data, opened, choice) => {
    const folder = choice?.kind === 'folder' ? choice.folder : undefined;
    const functions = [...pageFunctionsOf(data).values()];
    const inside = new Set(functions.filter(({ file }) => holds(folder, file)).map(({ id }) => id));
    const calls = markedCallsOf(data).filter(
      ({ caller, callee }) => inside.has(caller) || inside.has(callee),
    );
    const outside = new Set<FunctionId>(
      [...opened, ...calls.flatMap(({ caller, callee }) => [caller, callee])].filter(
        (id) => !inside.has(id),
      ),
    );
    return nestedSceneOf(
      data,
      functions.filter(({ id }) => inside.has(id) || outside.has(id)),
      calls,
      outside,
    );
  },
};
