import { highlightOf } from './highlight.ts';
import type { Laid, LaidBox, LaidLine, Point, Rect } from './layout.ts';
import { isLevelBox } from './scene.ts';
import type { FunctionBox, LevelBox } from './scene.ts';
import { arrowsOf, boxOf, endMarksOf, frameOf, lineOf } from './shapes.ts';
import { svgOf } from './svg.ts';

type LaidFunction = FunctionBox & Rect;
type LaidLevelBox = LevelBox & Rect;

const FIT_MARGIN = 40;
const MIN_SCALE = 0.05;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;
const VIEW_MARGIN = 24;

export interface Drawing {
  readonly draw: (laid: Laid, anchor?: string) => void;
  readonly fit: () => void;
  readonly highlight: (selected: string | undefined, hovered?: string) => void;
  readonly focus: (id: string) => void;
  readonly keepInView: (id: string) => void;
  readonly onBoxClick: (handler: (box: LaidFunction) => void) => void;
  readonly onLevelBoxClick: (handler: (box: LaidLevelBox) => void) => void;
  readonly onLineClick: (handler: (line: LaidLine) => void) => void;
  readonly onEmptyClick: (handler: () => void) => void;
  readonly onBoxHover: (handler: (id: string | undefined) => void) => void;
}

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
  const handlers: ((box: LaidFunction) => void)[] = [];
  const levelHandlers: ((box: LaidLevelBox) => void)[] = [];
  const lineHandlers: ((line: LaidLine) => void)[] = [];
  const emptyHandlers: (() => void)[] = [];
  const hoverHandlers: ((id: string | undefined) => void)[] = [];

  const apply = (): void => {
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
    const [x, y] = centreOf(box);
    camera.x = width / 2 - x * camera.scale;
    camera.y = height / 2 - y * camera.scale;
    apply();
  };

  const keepInView = (id: string): void => {
    const box = boxOfId(id);
    const { width, height } = sizeOf();
    if (box === undefined || width === 0 || height === 0) return;
    const shift = (start: number, size: number, room: number): number => {
      const end = start + size;
      if (size > room - 2 * VIEW_MARGIN || start < VIEW_MARGIN) return VIEW_MARGIN - start;
      return end > room - VIEW_MARGIN ? room - VIEW_MARGIN - end : 0;
    };
    const dx = shift(camera.x + box.x * camera.scale, box.width * camera.scale, width);
    const dy = shift(camera.y + box.y * camera.scale, box.height * camera.scale, height);
    if (dx === 0 && dy === 0) return;
    camera.x += dx;
    camera.y += dy;
    apply();
  };

  const highlight = (selected: string | undefined, hovered?: string): void => {
    const centre = hovered ?? selected;
    const lit = centre === undefined ? undefined : highlightOf(laid, centre);
    for (const element of viewport.querySelectorAll('[data-box], [data-line]')) {
      const box = element.getAttribute('data-box');
      const line = Number(element.getAttribute('data-line'));
      const isCentre = box !== null && box === lit?.selected;
      const connected = box === null ? lit?.lines.has(line) : lit?.boxes.has(box);
      element.classList.toggle('selected', box !== null && box === selected);
      element.classList.toggle('hovered', isCentre && box !== selected);
      element.classList.toggle('connected', connected === true);
      element.classList.toggle('faded', lit !== undefined && !isCentre && connected !== true);
    }
  };

  const draw = (next: Laid, anchor?: string): void => {
    const before = anchor === undefined ? undefined : boxOfId(anchor);
    laid = next;
    const endMarkOf = endMarksOf(next.boxes);
    const linesOf = (bundled: boolean): SVGGElement[] =>
      next.lines.flatMap((line, index) =>
        (line.kind === 'bundled') === bundled ? [lineOf(line, index, endMarkOf)] : [],
      );
    viewport.replaceChildren(
      svgOf('g', { class: 'frames' }, ...next.frames.map(frameOf)),
      svgOf('g', { class: 'lines' }, ...linesOf(true)),
      svgOf('g', { class: 'lines' }, ...linesOf(false)),
      svgOf('g', { class: 'boxes' }, ...next.boxes.map(boxOf)),
    );
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

  const boxAt = (target: EventTarget | null): LaidBox | undefined => {
    const element = target instanceof Element ? target.closest('[data-box]') : null;
    return boxOfId(element?.getAttribute('data-box') ?? '');
  };

  const clickedBox = (target: EventTarget | null): LaidFunction | undefined => {
    const box = boxAt(target);
    return box?.kind === 'function' ? box : undefined;
  };

  const clickedOpener = (target: EventTarget | null): LaidLevelBox | undefined => {
    const box = boxAt(target);
    return box !== undefined && isLevelBox(box) ? box : undefined;
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
  const fireLevelBoxClick = (box: LaidLevelBox): void => {
    for (const handler of levelHandlers) handler(box);
  };
  const activate = (target: EventTarget | null): boolean => {
    const box = clickedBox(target);
    const opener = clickedOpener(target);
    const line = clickedLine(target);
    if (box !== undefined) fireBoxClick(box);
    if (opener !== undefined) fireLevelBoxClick(opener);
    if (line !== undefined) fireLineClick(line);
    return box !== undefined || opener !== undefined || line !== undefined;
  };
  svg.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (activate(event.target)) return;
    for (const handler of emptyHandlers) handler();
  });
  const point = (target: EventTarget | null): void => {
    const id = boxAt(target)?.id;
    for (const handler of hoverHandlers) handler(id);
  };
  svg.addEventListener('pointerover', (event) => {
    point(event.target);
  });
  svg.addEventListener('pointerout', (event) => {
    point(event.relatedTarget);
  });
  svg.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (activate(event.target)) event.preventDefault();
  });

  apply();

  return {
    draw,
    fit,
    highlight,
    focus,
    keepInView,
    onBoxClick: (handler) => {
      handlers.push(handler);
    },
    onLevelBoxClick: (handler) => {
      levelHandlers.push(handler);
    },
    onLineClick: (handler) => {
      lineHandlers.push(handler);
    },
    onEmptyClick: (handler) => {
      emptyHandlers.push(handler);
    },
    onBoxHover: (handler) => {
      hoverHandlers.push(handler);
    },
  };
};
