import { arrowIconOf } from '../arrows.ts';
import type { Direction } from '../arrows.ts';
import type { CameraView } from '../camera.ts';
import { hiddenIdsOf } from '../hidden-parts.ts';
import { centreOf } from '../layout.ts';
import type { LaidBox, Rect } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';
import { countWordsOf } from '../words.ts';

type Edge = 'top' | 'right' | 'bottom' | 'left';

const EDGES: Readonly<Record<Edge, { readonly words: string; readonly arrow: Direction }>> = {
  top: { words: 'above', arrow: 'up' },
  right: { words: 'to the right', arrow: 'right' },
  bottom: { words: 'below', arrow: 'down' },
  left: { words: 'to the left', arrow: 'left' },
};

const distancePast = (edge: Edge, box: Rect, visible: Rect): number => {
  switch (edge) {
    case 'top':
      return visible.y - (box.y + box.height);
    case 'right':
      return box.x - (visible.x + visible.width);
    case 'bottom':
      return box.y - (visible.y + visible.height);
    case 'left':
      return visible.x - (box.x + box.width);
  }
};

const EDGE_GAP = 12;
const BOTTOM_GAP = 14;
const CLEARANCE = 4;

interface Span {
  readonly start: number;
  readonly end: number;
}

const placeOnEdge = (room: Span, size: number, blocked: readonly Span[]): number => {
  const middle = (room.start + room.end - size) / 2;
  const fits = (start: number): boolean =>
    start >= room.start &&
    start + size <= room.end &&
    blocked.every((span) => start + size <= span.start || start >= span.end);
  const candidates = [middle, ...blocked.flatMap(({ start, end }) => [end, start - size])];
  const free = candidates
    .filter(fits)
    .sort((left, right) => Math.abs(left - middle) - Math.abs(right - middle));
  return free[0] ?? middle;
};

const runsAlong = (edge: Edge): boolean => edge === 'top' || edge === 'bottom';

const screenRectOf = (box: Rect, view: CameraView): Rect => ({
  x: (box.x - view.visible.x) * view.scale,
  y: view.coveredTop + (box.y - view.visible.y) * view.scale,
  width: box.width * view.scale,
  height: box.height * view.scale,
});

const hintOf = (edge: Edge): HTMLButtonElement => {
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = `edge-hint ${edge}`;
  hint.hidden = true;
  return hint;
};

const edgeHints: PagePart = ({
  graph,
  camera,
  level: levelOf,
  hiddenMarks,
  onHiddenMarksChange,
  onOverviewMapToggle,
}) => {
  const edges = Object.keys(EDGES) as Edge[];
  const hints = new Map(edges.map((edge) => [edge, hintOf(edge)]));
  const nearest = new Map<Edge, LaidBox>();
  graph.append(...hints.values());

  const hideAll = (): void => {
    for (const hint of hints.values()) hint.hidden = true;
    nearest.clear();
  };

  const show = (view: CameraView): void => {
    const level = levelOf();
    const hidden = hiddenIdsOf(level, hiddenMarks());
    const boxes = level.boxes.filter(({ id }) => !hidden.has(id));
    if (boxes.length === 0) {
      hideAll();
      return;
    }
    const { visible } = view;
    const shown = visible.width > 0 ? boxes : [];
    for (const [edge, hint] of hints) {
      const past = shown
        .map((box) => ({ box, distance: distancePast(edge, box, visible) }))
        .filter(({ distance }) => distance >= 0)
        .sort((left, right) => left.distance - right.distance);
      const [first] = past;
      hint.hidden = first === undefined;
      if (first === undefined) {
        nearest.delete(edge);
        continue;
      }
      nearest.set(edge, first.box);
      hint.setAttribute(
        'aria-label',
        `${countWordsOf(past.length, 'more box', 'more boxes')} ${EDGES[edge].words}`,
      );
      const words = document.createElement('span');
      words.textContent = `${String(past.length)} more`;
      hint.replaceChildren(words, arrowIconOf(EDGES[edge].arrow));
    }
    placeHints(view, shown);
  };

  const placeHints = (view: CameraView, shown: readonly LaidBox[]): void => {
    const shownHints = [...hints].filter(([, hint]) => !hint.hidden);
    if (shownHints.length === 0) return;
    const bounds = graph.getBoundingClientRect();
    const obstacles = [
      ...shown.map((box) => screenRectOf(box, view)),
      ...(view.corner === undefined ? [] : [view.corner]),
    ];
    const top = view.coveredTop + EDGE_GAP;
    for (const [edge, hint] of shownHints) {
      const width = hint.offsetWidth;
      const height = hint.offsetHeight;
      const across: Span = {
        top: { start: top, end: top + height },
        bottom: { start: bounds.height - BOTTOM_GAP - height, end: bounds.height - BOTTOM_GAP },
        left: { start: EDGE_GAP, end: EDGE_GAP + width },
        right: { start: bounds.width - EDGE_GAP - width, end: bounds.width - EDGE_GAP },
      }[edge];
      const along = runsAlong(edge);
      const blocked = obstacles.flatMap((rect) => {
        const [crossStart, crossSize, start, size] = along
          ? [rect.y, rect.height, rect.x, rect.width]
          : [rect.x, rect.width, rect.y, rect.height];
        const crosses =
          crossStart < across.end + CLEARANCE && crossStart + crossSize > across.start - CLEARANCE;
        return crosses ? [{ start: start - CLEARANCE, end: start + size + CLEARANCE }] : [];
      });
      const room: Span = along
        ? { start: EDGE_GAP, end: bounds.width - EDGE_GAP }
        : { start: top, end: bounds.height - EDGE_GAP };
      const place = placeOnEdge(room, along ? width : height, blocked);
      if (along) {
        hint.style.left = `${String(place)}px`;
        if (edge === 'top') hint.style.top = `${String(top)}px`;
        obstacles.push({ x: place, y: across.start, width, height });
      } else {
        hint.style.top = `${String(place)}px`;
        obstacles.push({ x: across.start, y: place, width, height });
      }
    }
  };

  for (const [edge, hint] of hints) {
    hint.addEventListener('click', () => {
      const box = nearest.get(edge);
      if (box !== undefined) camera.centreOn(centreOf(box));
    });
  }

  show(camera.view());
  camera.onChange(show);
  onHiddenMarksChange(() => {
    show(camera.view());
  });
  onOverviewMapToggle(() => {
    show(camera.view());
  });
};

export default edgeHints;
