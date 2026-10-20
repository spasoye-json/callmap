import type { Laid, LaidBox, Point, Rect } from './layout.ts';
import { isLevelBox } from './scene.ts';

export type ZoomBand = 'map' | 'scan' | 'read';

const READING_FLOOR = 0.92;
const SCAN_FLOOR = 0.6;
const OPEN_MAX = 1.25;
const MIN_SCALE = 0.05;
const MAX_SCALE = 1.5;
const ZOOM_STEP = 1.25;
const FIT_MARGIN = 40;
const VIEW_MARGIN = 24;
const ANCHOR_SHARE = 1 / 3;
const DRAG_THRESHOLD = 4;

const bandOf = (scale: number): ZoomBand => {
  if (scale < SCAN_FLOOR) return 'map';
  return scale < READING_FLOOR ? 'scan' : 'read';
};

const openZoomOf = (fitZoom: number): number =>
  fitZoom >= READING_FLOOR ? Math.min(fitZoom, OPEN_MAX) : 1;

export interface CameraView {
  readonly scale: number;
  readonly band: ZoomBand;
  readonly visible: Rect;
  readonly level: Laid;
}

export interface Camera {
  readonly view: () => CameraView;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
  readonly reset: () => void;
  readonly centreOn: (point: Point) => void;
  readonly onChange: (handler: (view: CameraView) => void) => void;
}

export interface CameraRig extends Camera {
  readonly showLevel: (level: Laid, still?: string) => void;
  readonly open: (selected?: string) => void;
  readonly focus: (id: string) => void;
  readonly keepInView: (id: string) => void;
  readonly takeDrag: () => boolean;
}

const changesOf = (box: LaidBox): number => {
  if (isLevelBox(box)) return box.counts.changed + box.counts.added + box.counts.removed;
  if (box.kind !== 'function') return 0;
  const { mark } = box.pageFunction;
  return mark === undefined || mark === 'neighbour' ? 0 : 1;
};

const isOutside = (box: LaidBox): boolean => box.kind !== 'open-end' && box.outside;

const byPlace = (left: LaidBox, right: LaidBox): number => left.x - right.x || left.y - right.y;

const anchorOf = (boxes: readonly LaidBox[], selected: string | undefined): LaidBox | undefined => {
  const chosen = boxes.find(({ id }) => id === selected);
  if (chosen !== undefined) return chosen;
  const inside = boxes.filter((box) => !isOutside(box));
  const most = Math.max(0, ...inside.map(changesOf));
  const changed = inside.filter((box) => most > 0 && changesOf(box) === most);
  return [...(changed.length > 0 ? changed : boxes)].sort(byPlace)[0];
};

const centreOf = (box: Rect): Point => [box.x + box.width / 2, box.y + box.height / 2];

const EMPTY: Laid = { frames: [], boxes: [], lines: [], width: 0, height: 0 };

export const cameraOf = (
  container: HTMLElement,
  svg: SVGSVGElement,
  viewport: SVGGElement,
  sized: (scale: number) => void,
): CameraRig => {
  let scale = 1;
  let x = 0;
  let y = 0;
  let level = EMPTY;
  let sizedAt: number | undefined;
  const handlers: ((view: CameraView) => void)[] = [];

  const sizeOf = (): { readonly width: number; readonly height: number; readonly top: number } => {
    const { width, height } = container.getBoundingClientRect();
    const top = [...container.querySelectorAll(':scope > [data-covers="top"]')].reduce(
      (covered, cover) => Math.max(covered, cover.getBoundingClientRect().height),
      0,
    );
    return { width, height: Math.max(0, height - top), top };
  };

  const view = (): CameraView => {
    const { width, height, top } = sizeOf();
    return {
      scale,
      band: bandOf(scale),
      visible: {
        x: -x / scale,
        y: (top - y) / scale,
        width: width / scale,
        height: height / scale,
      },
      level,
    };
  };

  const apply = (): void => {
    viewport.setAttribute(
      'transform',
      `translate(${String(x)},${String(y)}) scale(${String(scale)})`,
    );
    svg.setAttribute('data-band', bandOf(scale));
    svg.style.setProperty('--zoom', String(scale));
    if (sizedAt !== scale) {
      sized(scale);
      sizedAt = scale;
    }
    const current = view();
    for (const handler of handlers) handler(current);
  };

  const boxOfId = (id: string): LaidBox | undefined => level.boxes.find((box) => box.id === id);

  const hasRoom = (): boolean => {
    const { width, height } = sizeOf();
    return width > 0 && height > 0 && level.width > 0 && level.height > 0;
  };

  const fitZoom = (): number => {
    const { width, height } = sizeOf();
    return Math.min((width - FIT_MARGIN) / level.width, (height - FIT_MARGIN) / level.height);
  };

  const centreLevel = (): void => {
    const { width, height, top } = sizeOf();
    x = (width - level.width * scale) / 2;
    y = top + (height - level.height * scale) / 2;
  };

  const fit = (): void => {
    if (!hasRoom()) return;
    scale = Math.min(fitZoom(), MAX_SCALE);
    centreLevel();
    apply();
  };

  const fitsOnAxis = (room: number, size: number): boolean => size * scale <= room - FIT_MARGIN;

  const open = (selected?: string): void => {
    if (!hasRoom()) return;
    scale = openZoomOf(fitZoom());
    centreLevel();
    const anchor = anchorOf(level.boxes, selected);
    if (anchor !== undefined) {
      const { width, height, top } = sizeOf();
      const [anchorX, anchorY] = centreOf(anchor);
      if (!fitsOnAxis(width, level.width)) x = width * ANCHOR_SHARE - anchorX * scale;
      if (!fitsOnAxis(height, level.height)) {
        const lowest = height - level.height * scale - VIEW_MARGIN;
        y = top + Math.max(lowest, Math.min(VIEW_MARGIN, height / 2 - anchorY * scale));
      }
    }
    apply();
  };

  const zoomAround = (next: number, [atX, atY]: Point): void => {
    const bounded = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    x = atX - ((atX - x) * bounded) / scale;
    y = atY - ((atY - y) * bounded) / scale;
    scale = bounded;
    apply();
  };

  const zoomFromCentre = (factor: number): void => {
    const { width, height, top } = sizeOf();
    zoomAround(scale * factor, [width / 2, top + height / 2]);
  };

  const centreOn = ([atX, atY]: Point): void => {
    const { width, height, top } = sizeOf();
    if (width === 0) return;
    x = width / 2 - atX * scale;
    y = top + height / 2 - atY * scale;
    apply();
  };

  const focus = (id: string): void => {
    const box = boxOfId(id);
    if (box !== undefined) centreOn(centreOf(box));
  };

  const keepInView = (id: string): void => {
    const box = boxOfId(id);
    const { width, height, top } = sizeOf();
    if (box === undefined || width === 0 || height === 0) return;
    const shift = (start: number, size: number, room: number): number => {
      const end = start + size;
      if (size > room - 2 * VIEW_MARGIN || start < VIEW_MARGIN) return VIEW_MARGIN - start;
      return end > room - VIEW_MARGIN ? room - VIEW_MARGIN - end : 0;
    };
    const dx = shift(x + box.x * scale, box.width * scale, width);
    const dy = shift(y - top + box.y * scale, box.height * scale, height);
    if (dx === 0 && dy === 0) return;
    x += dx;
    y += dy;
    apply();
  };

  const showLevel = (next: Laid, still?: string): void => {
    const before = still === undefined ? undefined : boxOfId(still);
    level = next;
    const after = still === undefined ? undefined : boxOfId(still);
    if (before !== undefined && after !== undefined) {
      const [beforeX, beforeY] = centreOf(before);
      const [afterX, afterY] = centreOf(after);
      x += (beforeX - afterX) * scale;
      y += (beforeY - afterY) * scale;
    }
    sizedAt = undefined;
    apply();
  };

  let drag: { readonly x: number; readonly y: number; moved: boolean } | undefined;
  let dragged = false;

  svg.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX - x, y: event.clientY - y, moved: false };
    dragged = false;
  });
  svg.addEventListener('pointermove', (event) => {
    if (drag === undefined) return;
    const nextX = event.clientX - drag.x;
    const nextY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(nextX - x, nextY - y) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      if ('setPointerCapture' in svg) svg.setPointerCapture(event.pointerId);
      svg.classList.add('panning');
    }
    x = nextX;
    y = nextY;
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
      zoomAround(scale * Math.exp(-event.deltaY * 0.0015), [
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ]);
    },
    { passive: false },
  );

  apply();

  return {
    view,
    zoomIn: () => {
      zoomFromCentre(ZOOM_STEP);
    },
    zoomOut: () => {
      zoomFromCentre(1 / ZOOM_STEP);
    },
    fit,
    reset: () => {
      zoomFromCentre(1 / scale);
    },
    centreOn,
    onChange: (handler) => {
      handlers.push(handler);
    },
    showLevel,
    open,
    focus,
    keepInView,
    takeDrag: () => {
      const was = dragged;
      dragged = false;
      return was;
    },
  };
};
