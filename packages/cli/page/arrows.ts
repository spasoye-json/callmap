import { svgOf } from './svg.ts';

export type Direction = 'up' | 'right' | 'down' | 'left';

const ARROW_PATHS: Readonly<Record<Direction, string>> = {
  up: 'M8 13V3M4 7l4-4 4 4',
  right: 'M3 8h10M9 4l4 4-4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
  left: 'M13 8H3M7 4L3 8l4 4',
};

export const arrowIconOf = (direction: Direction, className?: string): SVGSVGElement =>
  svgOf(
    'svg',
    {
      ...(className === undefined ? {} : { class: className }),
      width: 12,
      height: 12,
      viewBox: '0 0 16 16',
      'aria-hidden': 'true',
    },
    svgOf('path', { d: ARROW_PATHS[direction] }),
  );
