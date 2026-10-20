import type { FunctionMark } from '@callmap/review';
import { CHIP_SIZE, COUNT_CHIP_SIZE, svgChipOf } from './chips.ts';
import {
  COUNT_GAP,
  COUNTS_GAP,
  ICON_ROOM,
  ICON_SIZE,
  LEVEL_PADDING,
  countWidthOf,
} from './box-sizes.ts';
import type { LaidBox, LaidFrame, LaidLine, Point, Rect } from './layout.ts';
import { chipMarkOf, hasChanges, isLevelBox, markCountsOf } from './scene.ts';
import type { FunctionBox, LevelBox, LevelCounts } from './scene.ts';
import { svgOf } from './svg.ts';

const ARROWS = ['kept', 'added', 'removed', 'focus'] as const;
const BOX_PADDING = 10;
const CHIP_GAP = 8;

const rectOf = ({ x, y, width, height }: Rect, rounding: number): SVGRectElement =>
  svgOf('rect', { x, y, width, height, rx: rounding });

export const arrowsOf = (): SVGDefsElement =>
  svgOf(
    'defs',
    {},
    ...ARROWS.map((kind) =>
      svgOf(
        'marker',
        {
          id: `arrow-${kind}`,
          viewBox: '0 0 8 8',
          refX: 8,
          refY: 4,
          markerWidth: kind === 'kept' ? 8 : 9,
          markerHeight: kind === 'kept' ? 8 : 9,
          markerUnits: 'userSpaceOnUse',
          orient: 'auto',
        },
        svgOf('path', { class: `arrow ${kind}`, d: 'M0,0 L8,4 L0,8 z' }),
      ),
    ),
  );

const ICON_PATHS: Readonly<Record<'folder' | 'file', string>> = {
  folder: 'M1.5 4h4.5l1.5 1.5h7v7.5h-13z',
  file: 'M4 1.5h5l3 3V14.5H4z M9 1.5v3h3',
};

const iconOf = (kind: 'folder' | 'file', x: number, y: number, size: number): SVGGElement =>
  svgOf(
    'g',
    {
      class: `icon ${kind}`,
      'data-icon': kind,
      'aria-hidden': 'true',
      transform: `translate(${String(x)},${String(y)}) scale(${String(size / 16)})`,
    },
    svgOf('path', { d: ICON_PATHS[kind] }),
  );

export const frameOf = (frame: LaidFrame): SVGGElement =>
  svgOf(
    'g',
    { class: `frame ${frame.kind}`, 'data-frame': frame.id },
    rectOf(frame, 8),
    svgOf(
      'text',
      { x: frame.x + (frame.kind === 'folder' ? 27 : 10), y: frame.y + 19 },
      frame.label,
    ),
    ...(frame.kind === 'folder' ? [iconOf('folder', frame.x + 10, frame.y + 9, 12)] : []),
  );

const countsRowOf = (counts: LevelCounts, x: number, middle: number): SVGGElement => {
  let left = x;
  return svgOf(
    'g',
    { class: 'counts' },
    ...markCountsOf(counts).map(({ mark, count }) => {
      const entry = svgOf(
        'g',
        { class: `count ${mark}`, 'data-mark': mark, 'data-count': count },
        svgChipOf(mark, left, middle - COUNT_CHIP_SIZE / 2, COUNT_CHIP_SIZE),
        svgOf('text', { x: left + COUNT_CHIP_SIZE + COUNT_GAP, y: middle }, String(count)),
      );
      left += countWidthOf(count) + COUNTS_GAP;
      return entry;
    }),
  );
};

const levelBoxOf = (box: LevelBox & Rect): SVGGElement => {
  const counted = markCountsOf(box.counts).length > 0;
  const nameMiddle = counted ? box.y + 16 : box.y + box.height / 2;
  const left = box.x + LEVEL_PADDING;
  return svgOf(
    'g',
    {
      class: [
        'box',
        'level',
        box.kind,
        ...(hasChanges(box.counts) ? ['changed'] : []),
        ...(box.outside ? ['outside'] : []),
        'opens',
      ].join(' '),
      'data-box': box.id,
      'data-kind': box.kind,
      role: 'button',
      tabindex: 0,
      'aria-label': [box.label, ...markCountsOf(box.counts).map(({ words }) => words)].join(', '),
    },
    rectOf(box, 8),
    svgOf('text', { class: 'name', x: left + ICON_ROOM, y: nameMiddle }, box.label),
    iconOf(box.kind, left, nameMiddle - ICON_SIZE / 2, ICON_SIZE),
    ...(counted ? [countsRowOf(box.counts, left, box.y + 33)] : []),
  );
};

const functionBoxOf = (box: FunctionBox & Rect): SVGGElement => {
  const { mark, file } = box.pageFunction;
  const marks = mark === undefined ? [] : [mark];
  const chip = chipMarkOf(box);
  const middle = box.y + box.height / 2;
  const left = box.x + BOX_PADDING;
  return svgOf(
    'g',
    {
      class: ['box', 'function', ...marks, ...(box.outside ? ['outside'] : [])].join(' '),
      'data-box': box.id,
      'data-kind': box.kind,
      role: 'button',
      tabindex: 0,
      'aria-label': [box.label, file, ...marks].join(', '),
    },
    rectOf(box, 6),
    svgOf(
      'text',
      { class: 'name', x: chip === undefined ? left : left + CHIP_SIZE + CHIP_GAP, y: middle },
      box.label,
    ),
    ...(chip === undefined ? [] : [svgChipOf(chip, left, middle - CHIP_SIZE / 2)]),
  );
};

export const boxOf = (box: LaidBox): SVGGElement => {
  if (isLevelBox(box)) return levelBoxOf(box);
  if (box.kind === 'function') return functionBoxOf(box);
  return svgOf(
    'g',
    { class: 'box open-end', 'data-box': box.id, 'data-kind': box.kind },
    rectOf(box, 4),
    svgOf('text', { x: box.x + box.width / 2, y: box.y + box.height / 2 }, box.label),
  );
};

const pathOf = (points: readonly Point[]): string =>
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${String(x)},${String(y)}`).join(' ');

export type EndMark = FunctionMark | 'open-end' | 'none';

const endMarkOf = (box: LaidBox | undefined): EndMark => {
  if (box?.kind === 'function') return box.pageFunction.mark ?? 'none';
  return box?.kind === 'open-end' ? 'open-end' : 'none';
};

export const endMarksOf = (boxes: readonly LaidBox[]): ((id: string) => EndMark) => {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  return (id) => endMarkOf(byId.get(id));
};

const RING_RADIUS = 6;

const openRingOf = (points: readonly Point[]): readonly SVGElement[] => {
  const end = points.at(-1);
  if (end === undefined) return [];
  const [x, y] = end;
  return [
    svgOf(
      'g',
      { class: 'open-ring' },
      svgOf('circle', { cx: x - RING_RADIUS, cy: y, r: RING_RADIUS }),
      svgOf('text', { x: x - RING_RADIUS, y }, '?'),
    ),
  ];
};

const junctionOf = (points: readonly Point[]): readonly SVGElement[] => {
  const at = points[1] ?? points[0];
  return at === undefined
    ? []
    : [svgOf('circle', { class: 'junction', cx: at[0], cy: at[1], r: 3 })];
};

const labelOf = (line: LaidLine): readonly SVGElement[] => {
  const { label } = line;
  if (label === undefined) return [];
  return [
    svgOf(
      'g',
      {
        class: `label ${line.oneOf === undefined ? 'badge' : 'pill'}`,
        transform: `translate(${String(label.x + label.width / 2)},${String(label.y + label.height / 2)})`,
      },
      svgOf('rect', {
        x: -label.width / 2,
        y: -label.height / 2,
        width: label.width,
        height: label.height,
        rx: label.height / 2,
      }),
      svgOf('text', { x: 0, y: 0 }, label.text),
    ),
  ];
};

export const lineOf = (
  line: LaidLine,
  index: number,
  endMarkOfId: (id: string) => EndMark,
): SVGGElement => {
  const marks = new Set([line.mark, ...(line.calls ?? []).map(({ mark }) => mark)]);
  const classes = ['line', line.kind, ...(line.kind === 'open-end' ? [] : marks)];
  if (line.oneOf !== undefined) classes.push('one-of');
  const path = pathOf(line.points);
  const clickable =
    line.calls === undefined
      ? []
      : [
          svgOf('path', { class: 'hit', d: path, 'vector-effect': 'non-scaling-stroke' }),
          svgOf('title', {}, line.title ?? ''),
        ];
  return svgOf(
    'g',
    {
      class: classes.join(' '),
      'data-from': line.from,
      'data-to': line.to,
      'data-from-mark': endMarkOfId(line.from),
      'data-to-mark': endMarkOfId(line.to),
      'data-line': index,
      ...(line.calls === undefined
        ? {}
        : { role: 'button', tabindex: 0, 'aria-label': line.title ?? '' }),
    },
    svgOf('path', {
      class: 'edge',
      d: path,
      'vector-effect': 'non-scaling-stroke',
      ...(line.kind === 'open-end' ? {} : { 'marker-end': `url(#arrow-${line.mark})` }),
    }),
    ...(line.oneOf === undefined ? [] : junctionOf(line.points)),
    ...(line.kind === 'open-end' ? openRingOf(line.points) : []),
    ...labelOf(line),
    ...clickable,
  );
};
