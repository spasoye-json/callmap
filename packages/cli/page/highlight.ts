import type { Laid } from './layout.ts';

export interface Highlight {
  readonly selected: string;
  readonly boxes: ReadonlySet<string>;
  readonly lines: ReadonlySet<number>;
}

export const highlightOf = (laid: Laid, selected: string): Highlight | undefined => {
  const boxIds = new Set(laid.boxes.map(({ id }) => id));
  if (!boxIds.has(selected)) return undefined;
  const boxes = new Set<string>();
  const lines = new Set<number>();
  laid.lines.forEach((line, index) => {
    const touching = (line.calls ?? [line]).filter(
      ({ from, to }) => from === selected || to === selected,
    );
    if (touching.length === 0) return;
    lines.add(index);
    for (const { from, to } of touching) {
      const [otherEnd, lineEnd] = from === selected ? [to, line.to] : [from, line.from];
      boxes.add(boxIds.has(otherEnd) ? otherEnd : lineEnd);
    }
  });
  return { selected, boxes, lines };
};
