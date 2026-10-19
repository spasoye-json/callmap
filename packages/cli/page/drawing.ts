import { highlightOf } from './highlight.ts';
import type { Laid, LaidBox, LaidFrame, LaidLine, Point, Rect } from './layout.ts';
import type { FunctionBox } from './scene.ts';

type LaidFunction = FunctionBox & Rect;

const SVG = 'http://www.w3.org/2000/svg';
const ARROWS = ['kept', 'added', 'removed', 'open-end'] as const;
const FIT_MARGIN = 40;
const MIN_SCALE = 0.05;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;
const FAR_SCALE = 0.5;
const NEAR_SCALE = 1;

export interface DrawOptions {
  readonly anchor?: string | undefined;
  readonly zoomLevels?: boolean;
}

export interface Drawing {
  readonly draw: (laid: Laid, options?: DrawOptions) => void;
  readonly fit: () => void;
  readonly highlight: (selected: string | undefined) => void;
  readonly focus: (id: string) => void;
  readonly onBoxClick: (handler: (box: LaidFunction) => void) => void;
  readonly onLineClick: (handler: (line: LaidLine) => void) => void;
  readonly onEmptyClick: (handler: () => void) => void;
}

const svgOf = <Name extends keyof SVGElementTagNameMap>(
  name: Name,
  attributes: Readonly<Record<string, string | number>> = {},
  ...children: readonly (SVGElement | string)[]
): SVGElementTagNameMap[Name] => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.append(...children);
  return element;
};

const rectOf = ({ x, y, width, height }: Rect, rounding: number): SVGRectElement =>
  svgOf('rect', { x, y, width, height, rx: rounding });

const arrowsOf = (): SVGDefsElement =>
  svgOf(
    'defs',
    {},
    ...ARROWS.map((kind) =>
      svgOf(
        'marker',
        {
          id: `arrow-${kind}`,
          viewBox: '0 0 10 10',
          refX: 10,
          refY: 5,
          markerWidth: 9,
          markerHeight: 9,
          markerUnits: 'userSpaceOnUse',
          orient: 'auto',
        },
        svgOf('path', {
          class: `arrow ${kind}`,
          d: kind === 'open-end' ? 'M7,0 L10,0 L10,10 L7,10 z' : 'M0,0 L10,5 L0,10 z',
        }),
      ),
    ),
  );

const frameOf = (frame: LaidFrame): SVGGElement =>
  svgOf(
    'g',
    { class: `frame ${frame.kind}`, 'data-frame': frame.id },
    rectOf(frame, 6),
    svgOf('text', { x: frame.x + 10, y: frame.y + 19 }, frame.label),
  );

const boxOf = (box: LaidBox): SVGGElement => {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const text = svgOf('text', { x: centre.x, y: centre.y }, box.label);
  if (box.kind === 'open-end') {
    return svgOf(
      'g',
      { class: 'box open-end', 'data-box': box.id, 'data-kind': box.kind },
      rectOf(box, 4),
      text,
    );
  }
  const { mark, file } = box.pageFunction;
  const marks = mark === undefined ? [] : [mark];
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
    rectOf(box, 5),
    text,
  );
};

const pathOf = (points: readonly Point[]): string =>
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${String(x)},${String(y)}`).join(' ');

const lineOf = (line: LaidLine, index: number): SVGGElement => {
  const arrow = line.kind === 'open-end' ? 'open-end' : line.mark;
  const classes = ['line', line.kind, ...(line.kind === 'open-end' ? [] : [line.mark])];
  if (line.oneOf !== undefined) classes.push('one-of');
  const label =
    line.label === undefined
      ? []
      : [
          rectOf(line.label, 7),
          svgOf(
            'text',
            { x: line.label.x + line.label.width / 2, y: line.label.y + line.label.height / 2 },
            line.label.text,
          ),
        ];
  const path = pathOf(line.points);
  const clickable =
    line.calls === undefined
      ? []
      : [svgOf('path', { class: 'hit', d: path }), svgOf('title', {}, line.title ?? '')];
  return svgOf(
    'g',
    {
      class: classes.join(' '),
      'data-from': line.from,
      'data-to': line.to,
      'data-line': index,
      ...(line.calls === undefined
        ? {}
        : { role: 'button', tabindex: 0, 'aria-label': line.title ?? '' }),
    },
    svgOf('path', { d: path, 'marker-end': `url(#arrow-${arrow})` }),
    ...label,
    ...clickable,
  );
};

interface Camera {
  scale: number;
  x: number;
  y: number;
}

export const drawingOf = (container: HTMLElement): Drawing => {
  const viewport = svgOf('g', { class: 'viewport' });
  const svg = svgOf('svg', { class: 'drawing' }, arrowsOf(), viewport);
  container.append(svg);

  const camera: Camera = { scale: 1, x: 0, y: 0 };
  let laid: Laid = { frames: [], boxes: [], lines: [], width: 0, height: 0 };
  let zoomLevels = false;
  let details = svgOf('g', { class: 'details' });
  const handlers: ((box: LaidFunction) => void)[] = [];
  const lineHandlers: ((line: LaidLine) => void)[] = [];
  const emptyHandlers: (() => void)[] = [];

  const showDetails = (): void => {
    const far = zoomLevels && camera.scale < FAR_SCALE;
    if (far) details.remove();
    else if (details.parentNode === null) viewport.append(details);
  };

  const apply = (): void => {
    showDetails();
    viewport.setAttribute(
      'transform',
      `translate(${String(camera.x)},${String(camera.y)}) scale(${String(camera.scale)})`,
    );
  };

  const sizeOf = (): { readonly width: number; readonly height: number } => {
    const { width, height } = container.getBoundingClientRect();
    return { width, height };
  };

  const boxOfId = (id: string): LaidBox | undefined => laid.boxes.find((box) => box.id === id);

  const fit = (): void => {
    const { width, height } = sizeOf();
    if (width === 0 || height === 0 || laid.width === 0 || laid.height === 0) return;
    camera.scale = Math.min(
      (width - FIT_MARGIN) / laid.width,
      (height - FIT_MARGIN) / laid.height,
      1.5,
    );
    camera.x = (width - laid.width * camera.scale) / 2;
    camera.y = (height - laid.height * camera.scale) / 2;
    apply();
  };

  const centreOf = (box: Rect): Point => [box.x + box.width / 2, box.y + box.height / 2];

  const focus = (id: string): void => {
    const box = boxOfId(id);
    const { width, height } = sizeOf();
    if (box === undefined || width === 0) return;
    if (zoomLevels) camera.scale = Math.max(camera.scale, NEAR_SCALE);
    const [x, y] = centreOf(box);
    camera.x = width / 2 - x * camera.scale;
    camera.y = height / 2 - y * camera.scale;
    apply();
  };

  const highlight = (selected: string | undefined): void => {
    const lit = selected === undefined ? undefined : highlightOf(laid, selected);
    const drawn = [viewport, ...(details.parentNode === null ? [details] : [])].flatMap((group) => [
      ...group.querySelectorAll('[data-box], [data-line]'),
    ]);
    for (const element of drawn) {
      const box = element.getAttribute('data-box');
      const line = Number(element.getAttribute('data-line'));
      const isSelected = box !== null && box === lit?.selected;
      const connected = box === null ? lit?.lines.has(line) : lit?.boxes.has(box);
      element.classList.toggle('selected', isSelected);
      element.classList.toggle('connected', connected === true);
      element.classList.toggle('faded', lit !== undefined && !isSelected && connected !== true);
    }
  };

  const draw = (next: Laid, { anchor, zoomLevels: levels = false }: DrawOptions = {}): void => {
    const before = anchor === undefined ? undefined : boxOfId(anchor);
    laid = next;
    zoomLevels = levels;
    const linesOf = (bundled: boolean): SVGGElement[] =>
      next.lines.flatMap((line, index) =>
        (line.kind === 'bundled') === bundled ? [lineOf(line, index)] : [],
      );
    details = svgOf(
      'g',
      { class: 'details' },
      svgOf('g', { class: 'lines' }, ...linesOf(false)),
      svgOf('g', { class: 'boxes' }, ...next.boxes.map(boxOf)),
    );
    viewport.replaceChildren(
      svgOf('g', { class: 'frames' }, ...next.frames.map(frameOf)),
      svgOf('g', { class: 'lines' }, ...linesOf(true)),
    );
    showDetails();
    const after = anchor === undefined ? undefined : boxOfId(anchor);
    if (before !== undefined && after !== undefined) {
      const [beforeX, beforeY] = centreOf(before);
      const [afterX, afterY] = centreOf(after);
      camera.x += (beforeX - afterX) * camera.scale;
      camera.y += (beforeY - afterY) * camera.scale;
      apply();
    }
  };

  const clickedLine = (target: EventTarget | null): LaidLine | undefined => {
    const element = target instanceof Element ? target.closest('[data-line]') : null;
    return element === null ? undefined : laid.lines[Number(element.getAttribute('data-line'))];
  };

  const clickedBox = (target: EventTarget | null): LaidFunction | undefined => {
    const element = target instanceof Element ? target.closest('[data-box]') : null;
    const box = boxOfId(element?.getAttribute('data-box') ?? '');
    return box?.kind === 'function' ? box : undefined;
  };

  let drag: { readonly x: number; readonly y: number; moved: boolean } | undefined;
  let dragged = false;

  svg.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX - camera.x, y: event.clientY - camera.y, moved: false };
    dragged = false;
  });
  svg.addEventListener('pointermove', (event) => {
    if (drag === undefined) return;
    const x = event.clientX - drag.x;
    const y = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(x - camera.x, y - camera.y) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      if ('setPointerCapture' in svg) svg.setPointerCapture(event.pointerId);
      svg.classList.add('panning');
    }
    camera.x = x;
    camera.y = y;
    apply();
  });
  const endDrag = (): void => {
    dragged = drag?.moved ?? false;
    drag = undefined;
    svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const bounds = svg.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, camera.scale * Math.exp(-event.deltaY * 0.0015)),
      );
      camera.x = x - ((x - camera.x) * scale) / camera.scale;
      camera.y = y - ((y - camera.y) * scale) / camera.scale;
      camera.scale = scale;
      apply();
    },
    { passive: false },
  );

  const fireBoxClick = (box: LaidFunction): void => {
    for (const handler of handlers) handler(box);
  };
  const fireLineClick = (line: LaidLine): void => {
    for (const handler of lineHandlers) handler(line);
  };
  svg.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    const box = clickedBox(event.target);
    if (box !== undefined) fireBoxClick(box);
    const line = clickedLine(event.target);
    if (line !== undefined) fireLineClick(line);
    if (box === undefined && line === undefined) {
      for (const handler of emptyHandlers) handler();
    }
  });
  svg.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const box = clickedBox(event.target);
    const line = clickedLine(event.target);
    if (box === undefined && line?.calls === undefined) return;
    event.preventDefault();
    if (box !== undefined) fireBoxClick(box);
    if (line !== undefined) fireLineClick(line);
  });

  apply();

  return {
    draw,
    fit,
    highlight,
    focus,
    onBoxClick: (handler) => {
      handlers.push(handler);
    },
    onLineClick: (handler) => {
      lineHandlers.push(handler);
    },
    onEmptyClick: (handler) => {
      emptyHandlers.push(handler);
    },
  };
};
