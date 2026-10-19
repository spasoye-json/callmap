import type { FunctionId } from '@archmap/graph-document';
import { appendTo } from '@archmap/review';
import type { MarkedCall } from '@archmap/review';
import type { ReaderPageData } from './data.ts';
import type { PageFunction } from './functions.ts';
import { arrowKeyOf, frameIdOf, sceneOf } from './scene.ts';
import type { Scene, SceneBox, SceneFrame, SceneLine } from './scene.ts';

export const folderIdOf = (folder: string): string => `folder:${folder}`;

export const folderOf = (path: string): string | undefined => {
  const end = path.lastIndexOf('/');
  return end < 0 ? undefined : path.slice(0, end);
};

export const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export const foldersAbove = (file: string): readonly string[] => {
  const folder = folderOf(file);
  return folder === undefined ? [] : [folder, ...foldersAbove(folder)];
};

const parentOf = (path: string): { readonly parent?: string } => {
  const folder = folderOf(path);
  return folder === undefined ? {} : { parent: folderIdOf(folder) };
};

const bundled = (boxes: readonly SceneBox[], lines: readonly SceneLine[]): SceneLine[] => {
  const fileOf = new Map(
    boxes.flatMap((box): [string, string][] =>
      box.kind === 'function' ? [[box.id, box.pageFunction.file]] : [],
    ),
  );
  const pairOf = ({ kind, mark, from, to }: SceneLine): readonly [string, string] | undefined => {
    const fromFile = fileOf.get(from);
    const toFile = fileOf.get(to);
    if (kind !== 'call' || mark !== 'kept') return undefined;
    if (fromFile === undefined || toFile === undefined || fromFile === toFile) return undefined;
    return [fromFile, toFile];
  };
  const byPair = new Map<string, SceneLine[]>();
  for (const line of lines) {
    const pair = pairOf(line);
    if (pair !== undefined) appendTo(byPair, arrowKeyOf(...pair), line);
  }
  return lines.flatMap((line): SceneLine[] => {
    const pair = pairOf(line);
    const calls = pair === undefined ? undefined : byPair.get(arrowKeyOf(...pair));
    if (pair === undefined || calls === undefined || calls.length < 2) return [line];
    if (calls[0] !== line) return [];
    return [
      {
        kind: 'bundled',
        from: frameIdOf(pair[0]),
        to: frameIdOf(pair[1]),
        mark: 'kept',
        calls,
        title: `${String(calls.length)} calls from ${pair[0]} to ${pair[1]}`,
      },
    ];
  });
};

export const nestedSceneOf = (
  data: ReaderPageData,
  functions: readonly PageFunction[],
  calls: readonly MarkedCall[],
  outside?: ReadonlySet<FunctionId>,
): Scene => {
  const scene = sceneOf(data, functions, calls, outside);
  const files = [...new Set(functions.map(({ file }) => file))];
  const folders = [...new Set(files.flatMap(foldersAbove))];
  return {
    ...scene,
    lines: bundled(scene.boxes, scene.lines),
    frames: [
      ...folders.map((folder): SceneFrame => ({
        kind: 'folder',
        id: folderIdOf(folder),
        label: `${nameOf(folder)}/`,
        ...parentOf(folder),
      })),
      ...files.map((file): SceneFrame => ({
        kind: 'file',
        id: frameIdOf(file),
        label: nameOf(file),
        ...parentOf(file),
      })),
    ],
  };
};
