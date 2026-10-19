import type { Call, FunctionId, OpenEnd } from '@callmap/graph-document';
import { appendTo, byText } from '@callmap/review';
import type { CallMark, MarkedCall } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import type { PageFunction } from './functions.ts';

export interface SceneFrame {
  readonly kind: 'file' | 'folder';
  readonly id: string;
  readonly label: string;
  readonly parent?: string;
}

export interface FunctionBox {
  readonly kind: 'function';
  readonly id: FunctionId;
  readonly label: string;
  readonly frame: string;
  readonly pageFunction: PageFunction;
  readonly outside: boolean;
}

export interface OpenEndBox {
  readonly kind: 'open-end';
  readonly id: string;
  readonly label: string;
  readonly frame: string;
  readonly caller: FunctionId;
}

export type SceneBox = FunctionBox | OpenEndBox;

export interface SceneLine {
  readonly kind: 'call' | 'open-end' | 'bundled';
  readonly from: string;
  readonly to: string;
  readonly mark: CallMark;
  readonly oneOf?: string;
  readonly calls?: readonly SceneLine[];
  readonly title?: string;
}

export const lineLabelOf = ({ oneOf, calls }: SceneLine): string | undefined =>
  calls === undefined ? oneOf : String(calls.length);

export interface Scene {
  readonly frames: readonly SceneFrame[];
  readonly boxes: readonly SceneBox[];
  readonly lines: readonly SceneLine[];
}

export const frameIdOf = (file: string): string => `frame:${file}`;

export const arrowKeyOf = (from: string, to: string): string => `${from} -> ${to}`;

export const callKeyOf = ({ caller, callee }: Pick<Call, 'caller' | 'callee'>): string =>
  arrowKeyOf(caller, callee);

const openEndsByCallerOf = (
  { review, branchGraph }: ReaderPageData,
  reviewed: ReadonlySet<FunctionId>,
): ReadonlyMap<FunctionId, readonly OpenEnd[]> => {
  const byCaller = new Map<FunctionId, OpenEnd[]>();
  for (const openEnd of [
    ...review.openEnds,
    ...branchGraph.openEnds.filter(({ caller }) => !reviewed.has(caller)),
  ]) {
    appendTo(byCaller, openEnd.caller, openEnd);
  }
  return byCaller;
};

type GroupCall = Pick<Call, 'caller' | 'callee'> & { readonly group: string };

const oneOfLabelsOf = (
  { review, branchGraph }: ReaderPageData,
  reviewed: ReadonlySet<FunctionId>,
): ReadonlyMap<string, string> => {
  const groups = new Map<string, GroupCall[]>();
  const add = (call: GroupCall): void => {
    appendTo(groups, `${call.caller} ${call.group}`, call);
  };
  for (const { id, caller, callees } of review.oneOfGroups) {
    for (const callee of callees) add({ group: id, caller, callee });
  }
  for (const { group, caller, callee } of branchGraph.calls) {
    if (group !== undefined && !reviewed.has(caller)) add({ group, caller, callee });
  }
  return new Map(
    [...groups.values()].flatMap((calls) =>
      calls.map((call): [string, string] => [callKeyOf(call), `one of ${String(calls.length)}`]),
    ),
  );
};

const inFileOrder = (left: PageFunction, right: PageFunction): number =>
  byText(left.file, right.file) || left.firstLine - right.firstLine || byText(left.id, right.id);

export const sceneOf = (
  data: ReaderPageData,
  functions: readonly PageFunction[],
  calls: readonly MarkedCall[],
  outside: ReadonlySet<FunctionId> = new Set(),
): Scene => {
  const reviewed = new Set(data.review.functions.map(({ id }) => id));
  const openEnds = openEndsByCallerOf(data, reviewed);
  const oneOfLabels = oneOfLabelsOf(data, reviewed);
  const ordered = [...functions].sort(inFileOrder);
  const files = [...new Set(ordered.map(({ file }) => file))];

  const boxes = ordered.flatMap((shown): SceneBox[] => [
    {
      kind: 'function',
      id: shown.id,
      label: shown.name,
      frame: frameIdOf(shown.file),
      pageFunction: shown,
      outside: outside.has(shown.id),
    },
    ...(openEnds.get(shown.id) ?? []).map(({ expression, line }, index): OpenEndBox => ({
      kind: 'open-end',
      id: `open-end:${shown.id}:${String(index)}`,
      label: `${expression} :${String(line)}`,
      frame: frameIdOf(shown.file),
      caller: shown.id,
    })),
  ]);

  const callLines = calls.map((call): SceneLine => {
    const oneOf = oneOfLabels.get(callKeyOf(call));
    return {
      kind: 'call',
      from: call.caller,
      to: call.callee,
      mark: call.mark,
      ...(oneOf === undefined ? {} : { oneOf }),
    };
  });
  const openEndLines = boxes.flatMap((box): SceneLine[] =>
    box.kind === 'open-end'
      ? [{ kind: 'open-end', from: box.caller, to: box.id, mark: 'kept' }]
      : [],
  );

  return {
    frames: files.map((file): SceneFrame => ({ kind: 'file', id: frameIdOf(file), label: file })),
    boxes,
    lines: [...callLines, ...openEndLines],
  };
};
