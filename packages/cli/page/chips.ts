import type { FunctionMark } from '@callmap/review';
import { svgOf } from './svg.ts';

export type ChipMark = FunctionMark | 'open-end';

export const CHIP_SIZE = 16;
export const COUNT_CHIP_SIZE = 15;

export const GLYPHS: Readonly<Record<ChipMark, string>> = {
  changed: 'Δ',
  added: '+',
  removed: '−',
  neighbour: '·',
  'open-end': '?',
};

export const chipOf = (mark: ChipMark): HTMLSpanElement => {
  const chip = document.createElement('span');
  chip.className = `chip ${mark}`;
  chip.setAttribute('data-mark', mark);
  chip.setAttribute('aria-hidden', 'true');
  chip.textContent = GLYPHS[mark];
  return chip;
};

export const svgChipOf = (
  mark: ChipMark,
  x: number,
  y: number,
  size: number = CHIP_SIZE,
  attributes: Readonly<Record<string, string>> = {},
): SVGGElement =>
  svgOf(
    'g',
    { class: `chip ${mark}`, 'data-mark': mark, 'aria-hidden': 'true', ...attributes },
    svgOf('rect', { x, y, width: size, height: size, rx: 4 }),
    svgOf('text', { x: x + size / 2, y: y + size / 2 }, GLYPHS[mark]),
  );
