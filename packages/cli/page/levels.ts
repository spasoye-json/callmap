import { addTo, byText } from '@callmap/review';
import type { CallMark } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { markedCallsOf, pageFunctionsOf } from './functions.ts';
import type { PageFunction } from './functions.ts';
import { folderIdOf, foldersAbove } from './nested-scene.ts';
import { arrowKeyOf, sceneOf as functionSceneOf } from './scene.ts';
import type { LevelBox, LevelCounts, Scene, SceneFrame, SceneLine } from './scene.ts';
import { countWordsOf } from './words.ts';

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

const isInFolder = (folder: string, path: string): boolean =>
  folder === ROOT || path.startsWith(`${folder}/`);

const isInBox = (box: string, file: string): boolean => box === file || isInFolder(box, file);

const relativeTo = (folder: string, path: string): string =>
  folder === ROOT ? path : path.slice(folder.length + 1);

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
    `${countWordsOf(calls.length, 'call', 'calls')} from ${from} to ${to}`,
    ...(['added', 'removed'] as const).flatMap((mark) => {
      const count = calls.filter((call) => call.mark === mark).length;
      return count === 0 ? [] : [countWordsOf(count, mark)];
    }),
  ].join(', '),
});

interface EndedCall {
  readonly from: string;
  readonly to: string;
  readonly call: SceneLine;
}

const linesByEndsOf = (
  calls: readonly EndedCall[],
  lineOf: (from: string, to: string, group: readonly [SceneLine, ...SceneLine[]]) => SceneLine,
): readonly SceneLine[] => {
  const groups = new Map<
    string,
    { readonly from: string; readonly to: string; readonly calls: [SceneLine, ...SceneLine[]] }
  >();
  for (const { from, to, call } of calls) {
    const key = [arrowKeyOf(from, to), ...(call.oneOf === undefined ? [] : [call.oneOf])].join(' ');
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { from, to, calls: [call] });
    else group.calls.push(call);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => byText(left, right))
    .map(([, { from, to, calls: group }]) => lineOf(from, to, group));
};

const outsideEndsOf = (
  lines: readonly SceneLine[],
  isInside: (path: string) => boolean,
): readonly string[] =>
  [...new Set(lines.flatMap(({ from, to }) => [from, to]))]
    .filter((path) => !isInside(path))
    .sort(byText);

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
    return collapsed(
      [...foldersAbove(file).toReversed(), file].find((path) => !around.has(path)) ?? file,
    );
  };

  const boxPathOf = (level: string, inside: readonly string[], file: string): string =>
    isInFolder(level, file)
      ? (inside.find((box) => isInBox(box, file)) ?? file)
      : outsidePathOf(level, file);

  const marked = data.review.functions;
  const openEndCallers = openEndCallersOf(data);
  const countsOf = (box: string): LevelCounts => {
    const inBox = ({ file }: Pick<PageFunction, 'file'>): boolean => isInBox(box, file);
    const withMark = (mark: string): number =>
      marked.filter((shown) => shown.mark === mark && inBox(shown)).length;
    return {
      functions: [...functions.values()].filter((shown) => shown.mark !== 'removed' && inBox(shown))
        .length,
      changed: withMark('changed'),
      added: withMark('added'),
      removed: withMark('removed'),
      openEnds: openEndCallers.filter((caller) => {
        const shown = functions.get(caller);
        return shown !== undefined && inBox(shown);
      }).length,
    };
  };

  const boxOf = (level: string, path: string, outside: boolean, frame: string): LevelBox => ({
    kind: isFolder(path) ? 'folder' : 'file',
    id: path,
    label: `${outside ? path : relativeTo(level, path)}${isFolder(path) ? '/' : ''}`,
    frame,
    outside,
    counts: countsOf(path),
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
    const callLines = linesByEndsOf(
      scene.lines.flatMap((line): EndedCall[] =>
        line.kind === 'call' ? [{ from: endOf(line.from), to: endOf(line.to), call: line }] : [],
      ),
      (from, to, group) =>
        group.length === 1
          ? { ...group[0], from, to }
          : bundledLineOf(from, to, group, group[0].oneOf),
    );
    const outside = outsideEndsOf(callLines, (path) => ownIds.has(path));
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
    const lines = linesByEndsOf(
      markedCallsOf(data).flatMap(({ caller, callee, mark }): EndedCall[] => {
        const from = functions.get(caller);
        const to = functions.get(callee);
        if (from === undefined || to === undefined) return [];
        if (!isInFolder(level, from.file) && !isInFolder(level, to.file)) return [];
        const fromBox = boxPathOf(level, inside, from.file);
        const toBox = boxPathOf(level, inside, to.file);
        return fromBox === toBox
          ? []
          : [{ from: fromBox, to: toBox, call: { kind: 'call', from: caller, to: callee, mark } }];
      }),
      bundledLineOf,
    );
    const outside = outsideEndsOf(lines, (path) => inside.includes(path));
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
      const next = boxPathsOf(open).find((box) => isInBox(box, level));
      if (next === undefined) break;
      crumbs.push({ path: next, label: `${relativeTo(open, next)}${isFolder(next) ? '/' : ''}` });
      open = next;
    }
    return crumbs;
  };

  return { top, sceneOf, crumbsOf };
};

const levelsByData = new WeakMap<ReaderPageData, Levels>();

export const levelsOf = (data: ReaderPageData): Levels => {
  const levels = levelsByData.get(data) ?? levelsFor(data);
  levelsByData.set(data, levels);
  return levels;
};
