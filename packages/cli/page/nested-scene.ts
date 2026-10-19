import { appendTo } from '@archmap/review';
import type { MarkedCall, MarkedFunction } from '@archmap/review';
import type { ReaderPageData } from './data.ts';
import { frameIdOf, sceneOf } from './scene.ts';
import type { Scene, SceneBox, SceneFrame, SceneLine } from './scene.ts';

export const folderIdOf = (folder: string): string => `folder:${folder}`;

const folderOf = (path: string): string | undefined => {
  const end = path.lastIndexOf('/');
  return end < 0 ? undefined : path.slice(0, end);
};

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const foldersAbove = (file: string): readonly string[] => {
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
      box.kind === 'function' ? [[box.id, box.marked.file]] : [],
    ),
  );
  const pairOf = ({ kind, mark, from, to }: SceneLine): readonly [string, string] | undefined => {
    const fromFile = fileOf.get(from);
    const toFile = fileOf.get(to);
    if (kind !== 'call' || mark !== 'kept') return undefined;
    if (fromFile === undefined || toFile === undefined || fromFile === toFile) return undefined;
    return [fromFile, toFile];
  };
  const keyOf = (pair: readonly [string, string]): string => `${pair[0]} -> ${pair[1]}`;
  const byPair = new Map<string, SceneLine[]>();
  for (const line of lines) {
    const pair = pairOf(line);
    if (pair !== undefined) appendTo(byPair, keyOf(pair), line);
  }
  return lines.flatMap((line): SceneLine[] => {
    const pair = pairOf(line);
    const calls = pair === undefined ? undefined : byPair.get(keyOf(pair));
    if (pair === undefined || calls === undefined || calls.length < 2) return [line];
    if (calls[0] !== line) return [];
    return [
      {
        kind: 'bundle',
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
  functions: readonly MarkedFunction[],
  calls: readonly MarkedCall[],
): Scene => {
  const scene = sceneOf(data, functions, calls);
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
