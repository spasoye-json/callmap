import type { Laid } from './layout.ts';

export interface Highlight {
  readonly selected: string;
  readonly boxes: ReadonlySet<string>;
  readonly lines: ReadonlySet<number>;
}

export const highlightOf = (laid: Laid, selected: string): Highlight | undefined => {
  if (!laid.boxes.some(({ id }) => id === selected)) return undefined;
  const boxes = new Set<string>();
  const lines = new Set<number>();
  laid.lines.forEach((line, index) => {
    const touching = (line.calls ?? [line]).filter(
      ({ from, to }) => from === selected || to === selected,
    );
    if (touching.length === 0) return;
    lines.add(index);
    for (const { from, to } of touching) boxes.add(from === selected ? to : from);
  });
  return { selected, boxes, lines };
};
