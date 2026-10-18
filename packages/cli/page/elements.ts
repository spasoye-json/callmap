import type { ElementDefinition } from 'cytoscape';
import type { Review } from '@archmap/review';
import { layoutOf } from './layout.ts';

export const frameIdOf = (file: string): string => `frame:${file}`;

export const elementsOf = (review: Review): ElementDefinition[] => {
  const positions = layoutOf(review.functions, review.calls);
  const files = [...new Set(review.functions.map(({ file }) => file))].sort();

  const frames = files.map((file): ElementDefinition => ({
    group: 'nodes',
    data: { id: frameIdOf(file), label: file },
    classes: 'file-frame',
  }));

  const boxes = review.functions.map(({ id, name, file, mark }): ElementDefinition => ({
    group: 'nodes',
    data: { id, label: name, parent: frameIdOf(file) },
    position: { ...(positions.get(id) ?? { x: 0, y: 0 }) },
    classes: `function ${mark}`,
  }));

  const arrows = review.calls.map(({ caller, callee, mark }, index): ElementDefinition => ({
    group: 'edges',
    data: { id: `call:${index}`, source: caller, target: callee },
    classes: `call ${mark}`,
  }));

  return [...frames, ...boxes, ...arrows];
};
