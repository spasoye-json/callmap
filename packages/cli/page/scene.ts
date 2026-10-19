import type { Call, FunctionId, OpenEnd } from '@archmap/graph-document';
import { appendTo, byText } from '@archmap/review';
import type { CallMark, MarkedCall, MarkedFunction } from '@archmap/review';
import type { ReaderPageData } from './data.ts';

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
  readonly marked: MarkedFunction;
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
  readonly kind: 'call' | 'open-end' | 'bundle';
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

export const callKeyOf = ({ caller, callee }: Pick<Call, 'caller' | 'callee'>): string =>
  `${caller} -> ${callee}`;

const openEndsByCallerOf = ({
  review,
  branchGraph,
}: ReaderPageData): ReadonlyMap<FunctionId, readonly OpenEnd[]> => {
  const reviewed = new Set(review.functions.map(({ id }) => id));
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

const oneOfLabelsOf = ({ review, branchGraph }: ReaderPageData): ReadonlyMap<string, string> => {
  const reviewed = new Set(review.functions.map(({ id }) => id));
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

const inFileOrder = (left: MarkedFunction, right: MarkedFunction): number =>
  byText(left.file, right.file) || left.firstLine - right.firstLine || byText(left.id, right.id);

export const sceneOf = (
  data: ReaderPageData,
  functions: readonly MarkedFunction[],
  calls: readonly MarkedCall[],
): Scene => {
  const openEnds = openEndsByCallerOf(data);
  const oneOfLabels = oneOfLabelsOf(data);
  const ordered = [...functions].sort(inFileOrder);
  const files = [...new Set(ordered.map(({ file }) => file))];

  const boxes = ordered.flatMap((marked): SceneBox[] => [
    { kind: 'function', id: marked.id, label: marked.name, frame: frameIdOf(marked.file), marked },
    ...(openEnds.get(marked.id) ?? []).map(({ expression, line }, index): OpenEndBox => ({
      kind: 'open-end',
      id: `open-end:${marked.id}:${String(index)}`,
      label: `${expression} :${String(line)}`,
      frame: frameIdOf(marked.file),
      caller: marked.id,
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
