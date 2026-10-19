import { addTo, appendTo, byText } from '@callmap/review';
import type { CallMark } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { markedCallsOf, pageFunctionsOf } from './functions.ts';
import type { PageFunction } from './functions.ts';
import { folderIdOf, foldersAbove } from './nested-scene.ts';
import { arrowKeyOf } from './scene.ts';
import type { LevelBox, Scene, SceneFrame, SceneLine } from './scene.ts';

export interface Crumb {
  readonly path: string;
  readonly label: string;
}

export interface Levels {
  readonly top: string;
  readonly sceneOf: (level: string) => Scene;
  readonly crumbsOf: (level: string) => readonly Crumb[];
  readonly levelHolding: (file: string) => string;
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
    ...(isFolder(path) ? { opens: { kind: 'level', path } } : {}),
  });

  const sceneOf = (level: string): Scene => {
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
        return {
          kind: 'bundled',
          from,
          to,
          mark: markOf(calls),
          calls,
          title: `${counted(calls.length, 'call', 'calls').join('')} from ${from} to ${to}`,
        };
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
      if (next === undefined || !isFolder(next)) break;
      crumbs.push({ path: next, label: `${relativeTo(open, next)}/` });
      open = next;
    }
    return crumbs;
  };

  const levelHolding = (file: string): string => {
    let open = top;
    for (;;) {
      const next = boxPathsOf(open).find((box) => within(box, file));
      if (next === undefined || next === file) return open;
      open = next;
    }
  };

  return { top, sceneOf, crumbsOf, levelHolding };
};

const known = new WeakMap<ReaderPageData, Levels>();

export const levelsOf = (data: ReaderPageData): Levels => {
  const levels = known.get(data) ?? levelsFor(data);
  known.set(data, levels);
  return levels;
};
