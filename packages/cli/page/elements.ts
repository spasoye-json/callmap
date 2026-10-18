import type { ElementDefinition } from 'cytoscape';
import type { FunctionId, GraphFunction } from '@archmap/graph-document';
import type { CallMark, FunctionMark, Review } from '@archmap/review';
import { layoutOf } from './layout.ts';
import type { Position } from './layout.ts';

export const frameIdOf = (file: string): string => `frame:${file}`;

export const callIdOf = (caller: FunctionId, callee: FunctionId): string =>
  `call:${caller} -> ${callee}`;

export const frameOf = (file: string): ElementDefinition => ({
  group: 'nodes',
  data: { id: frameIdOf(file), label: file },
  classes: 'file-frame',
  selectable: false,
});

export const boxOf = (
  { id, name, file, firstLine }: GraphFunction,
  mark: FunctionMark,
  position: Position,
): ElementDefinition => ({
  group: 'nodes',
  data: { id, label: name, parent: frameIdOf(file), file, firstLine },
  position: { ...position },
  classes: `function ${mark}`,
});

export const arrowOf = (
  caller: FunctionId,
  callee: FunctionId,
  mark: CallMark,
): ElementDefinition => ({
  group: 'edges',
  data: { id: callIdOf(caller, callee), source: caller, target: callee },
  classes: `call ${mark}`,
  selectable: false,
});

export const elementsOf = (review: Review): ElementDefinition[] => {
  const positions = layoutOf(review.functions, review.calls);
  const files = [...new Set(review.functions.map(({ file }) => file))].sort();
  return [
    ...files.map(frameOf),
    ...review.functions.map((marked) =>
      boxOf(marked, marked.mark, positions.get(marked.id) ?? { x: 0, y: 0 }),
    ),
    ...review.calls.map(({ caller, callee, mark }) => arrowOf(caller, callee, mark)),
  ];
};
