import { addTo, appendTo, byText } from '@callmap/review';
import type { CallMark } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { markedCallsOf, pageFunctionsOf } from './functions.ts';
import type { PageFunction } from './functions.ts';
import { folderIdOf, foldersAbove } from './nested-scene.ts';
import { arrowKeyOf, sceneOf as functionSceneOf } from './scene.ts';
import type { LevelBox, Scene, SceneFrame, SceneLine } from './scene.ts';

export interface Crumb {
  readonly path: string;
  readonly label: string;
}

export interface Levels {
  readonly top: string;
  readonly sceneOf: (level: string) => Scene;
  readonly crumbsOf: (level: string) => readonly Crumb[];
}

const ROOT = '';

const holds = (folder: string, path: string): boolean =>
  folder === ROOT || path.startsWith(`${folder}/`);

const within = (box: string, file: string): boolean => box === file || holds(box, file);

const relativeTo = (folder: string, path: string): string =>
  folder === ROOT ? path : path.slice(folder.length + 1);

const counted = (count: number, one: string, many = one): readonly string[] =>
  count === 0 ? [] : [`${String(count)} ${count === 1 ? one : many}`];

const markOf = (calls: readonly SceneLine[]): CallMark =>
  (['added', 'removed'] as const).find((mark) => calls.some((call) => call.mark === mark)) ??
  'kept';

const bundledLineOf = (
  from: string,
  to: string,
  calls: readonly SceneLine[],
  oneOf?: string,
): SceneLine => ({
  kind: 'bundled',
  from,
  to,
  mark: markOf(calls),
  ...(oneOf === undefined ? {} : { oneOf }),
  calls,
  title: [
    `${counted(calls.length, 'call', 'calls').join('')} from ${from} to ${to}`,
    ...(['added', 'removed'] as const).flatMap((mark) =>
      counted(calls.filter((call) => call.mark === mark).length, mark),
    ),
  ].join(', '),
});

const openEndCallersOf = ({ review, branchGraph }: ReaderPageData): readonly string[] => {
  const reviewed = new Set(review.functions.map(({ id }) => id));
  return [
    ...review.openEnds,
    ...branchGraph.openEnds.filter(({ caller }) => !reviewed.has(caller)),
  ].map(({ caller }) => caller);
};

const levelsFor = (data: ReaderPageData): Levels => {
  const functions = pageFunctionsOf(data);
  const files = new Set([...functions.values()].map(({ file }) => file));
  const children = new Map<string, Set<string>>();
  for (const file of files) {
    const chain = [file, ...foldersAbove(file)];
    chain.forEach((path, index) => {
      addTo(children, chain[index + 1] ?? ROOT, path);
    });
  }
  const childrenOf = (folder: string): readonly string[] =>
    [...(children.get(folder) ?? [])].sort(byText);
  const isFolder = (path: string): boolean => !files.has(path);

  const collapsed = (path: string): string => {
    const [only, ...others] = childrenOf(path);
    return isFolder(path) && only !== undefined && others.length === 0 ? collapsed(only) : path;
  };

  const topOf = (folder: string): string => {
    const [only, ...others] = childrenOf(folder);
    return only !== undefined && others.length === 0 && isFolder(only) ? topOf(only) : folder;
  };
  const top = topOf(ROOT);

  const boxPathsOf = (level: string): readonly string[] => childrenOf(level).map(collapsed);

  const outsidePathOf = (level: string, file: string): string => {
    const around = new Set([ROOT, level, ...foldersAbove(level)]);
    return [...foldersAbove(file).toReversed(), file].find((path) => !around.has(path)) ?? file;
  };

  const boxPathOf = (level: string, inside: readonly string[], file: string): string =>
    holds(level, file)
      ? (inside.find((box) => within(box, file)) ?? file)
      : outsidePathOf(level, file);

  const marked = data.review.functions;
  const openEndCallers = openEndCallersOf(data);
  const countsOf = (box: string): { readonly changed: boolean; readonly counts: string } => {
    const inBox = ({ file }: Pick<PageFunction, 'file'>): boolean => within(box, file);
    const withMark = (mark: string): number =>
      marked.filter((shown) => shown.mark === mark && inBox(shown)).length;
    const changes = [
      ...counted(withMark('changed'), 'changed'),
      ...counted(withMark('added'), 'added'),
      ...counted(withMark('removed'), 'removed'),
    ];
    const openEnds = openEndCallers.filter((caller) => {
      const shown = functions.get(caller);
      return shown !== undefined && inBox(shown);
    }).length;
    return {
      changed: changes.length > 0,
      counts: [...changes, ...counted(openEnds, 'open end', 'open ends')].join(', '),
    };
  };

  const boxOf = (level: string, path: string, outside: boolean, frame: string): LevelBox => ({
    kind: isFolder(path) ? 'folder' : 'file',
    id: path,
    label: `${outside ? path : relativeTo(level, path)}${isFolder(path) ? '/' : ''}`,
    frame,
    outside,
    ...countsOf(path),
    opens: { kind: 'level', path },
  });

  const fileSceneOf = (file: string): Scene => {
    const own = [...functions.values()].filter((shown) => shown.file === file);
    const ownIds = new Set(own.map(({ id }) => id));
    const calls = markedCallsOf(data).filter(
      ({ caller, callee }) =>
        functions.has(caller) &&
        functions.has(callee) &&
        (ownIds.has(caller) || ownIds.has(callee)),
    );
    const scene = functionSceneOf(data, own, calls);
    const endOf = (id: string): string =>
      ownIds.has(id) ? id : outsidePathOf(file, functions.get(id)?.file ?? id);
    const byPair = new Map<string, SceneLine[]>();
    const ends = new Map<string, readonly [string, string]>();
    for (const line of scene.lines) {
      if (line.kind !== 'call') continue;
      const pair = [endOf(line.from), endOf(line.to)] as const;
      const key = `${arrowKeyOf(...pair)} ${line.oneOf ?? ''}`;
      ends.set(key, pair);
      appendTo(byPair, key, line);
    }
    const callLines = [...byPair.entries()]
      .sort(([left], [right]) => byText(left, right))
      .map(([key, group]): SceneLine => {
        const [from, to] = ends.get(key) ?? ['', ''];
        const [only, ...others] = group;
        return only !== undefined && others.length === 0
          ? { ...only, from, to }
          : bundledLineOf(from, to, group, only?.oneOf);
      });
    const outside = [...new Set(callLines.flatMap(({ from, to }) => [from, to]))]
      .filter((path) => !ownIds.has(path))
      .sort(byText);
    return {
      frames: scene.frames,
      boxes: [...scene.boxes, ...outside.map((path) => boxOf(file, path, true, ''))],
      lines: [...callLines, ...scene.lines.filter(({ kind }) => kind !== 'call')],
    };
  };

  const sceneOf = (level: string): Scene => {
    if (!isFolder(level)) return fileSceneOf(level);
    const inside = boxPathsOf(level);
    const frames: SceneFrame[] =
      level === top ? [] : [{ kind: 'folder', id: folderIdOf(level), label: `${level}/` }];
    const frame = frames[0]?.id ?? '';
    const byPair = new Map<string, SceneLine[]>();
    const ends = new Map<string, readonly [string, string]>();
    for (const { caller, callee, mark } of markedCallsOf(data)) {
      const from = functions.get(caller);
      const to = functions.get(callee);
      if (from === undefined || to === undefined) continue;
      if (!holds(level, from.file) && !holds(level, to.file)) continue;
      const pair = [
        boxPathOf(level, inside, from.file),
        boxPathOf(level, inside, to.file),
      ] as const;
      if (pair[0] === pair[1]) continue;
      const key = arrowKeyOf(...pair);
      ends.set(key, pair);
      appendTo(byPair, key, { kind: 'call', from: caller, to: callee, mark });
    }
    const lines = [...byPair.entries()]
      .sort(([left], [right]) => byText(left, right))
      .map(([key, calls]): SceneLine => {
        const [from, to] = ends.get(key) ?? ['', ''];
        return bundledLineOf(from, to, calls);
      });
    const outside = [...new Set(lines.flatMap(({ from, to }) => [from, to]))]
      .filter((path) => !inside.includes(path))
      .sort(byText);
    return {
      frames,
      boxes: [
        ...inside.map((path) => boxOf(level, path, false, frame)),
        ...outside.map((path) => boxOf(level, path, true, '')),
      ],
      lines,
    };
  };

  const crumbsOf = (level: string): readonly Crumb[] => {
    const crumbs: Crumb[] = [{ path: top, label: top === ROOT ? './' : `${top}/` }];
    let open = top;
    while (open !== level) {
      const next = boxPathsOf(open).find((box) => within(box, level));
      if (next === undefined) break;
      crumbs.push({ path: next, label: `${relativeTo(open, next)}${isFolder(next) ? '/' : ''}` });
      open = next;
    }
    return crumbs;
  };

  return { top, sceneOf, crumbsOf };
};

const known = new WeakMap<ReaderPageData, Levels>();

export const levelsOf = (data: ReaderPageData): Levels => {
  const levels = known.get(data) ?? levelsFor(data);
  known.set(data, levels);
  return levels;
};
