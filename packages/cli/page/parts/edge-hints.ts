import type { CameraView } from '../camera.ts';
import type { LaidBox, Point, Rect } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

type Edge = 'top' | 'right' | 'bottom' | 'left';

const EDGES: Readonly<Record<Edge, { readonly words: string; readonly arrow: string }>> = {
  top: { words: 'above', arrow: 'M8 13V3M4 7l4-4 4 4' },
  right: { words: 'to the right', arrow: 'M3 8h10M9 4l4 4-4 4' },
  bottom: { words: 'below', arrow: 'M8 3v10M4 9l4 4 4-4' },
  left: { words: 'to the left', arrow: 'M13 8H3M7 4L3 8l4 4' },
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

const coveredTopOf = (graph: HTMLElement): number =>
  Math.max(
    0,
    ...[...graph.querySelectorAll(':scope > [data-covers="top"]')].map(
      (cover) => cover.getBoundingClientRect().height,
    ),
  );

const hiddenMarksOf = (graph: HTMLElement): ReadonlySet<string> =>
  new Set((graph.getAttribute('data-hidden-marks') ?? '').split(/\s+/));

const isShown = (box: LaidBox, hidden: ReadonlySet<string>): boolean =>
  box.kind !== 'function' || !hidden.has(box.pageFunction.mark ?? '');

const centreOf = ({ x, y, width, height }: Rect): Point => [x + width / 2, y + height / 2];

const hintOf = (edge: Edge): HTMLButtonElement => {
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = `edge-hint ${edge}`;
  hint.hidden = true;
  return hint;
};

const edgeHints: PagePart = ({ graph, camera }) => {
  const edges = Object.keys(EDGES) as Edge[];
  const hints = new Map(edges.map((edge) => [edge, hintOf(edge)]));
  const nearest = new Map<Edge, LaidBox>();
  graph.append(...hints.values());

  const show = ({ level, visible }: CameraView): void => {
    const hidden = hiddenMarksOf(graph);
    hints.get('top')?.style.setProperty('top', `${String(coveredTopOf(graph) + EDGE_GAP)}px`);
    const shown = visible.width > 0 ? level.boxes.filter((box) => isShown(box, hidden)) : [];
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
      const count = String(past.length);
      hint.setAttribute(
        'aria-label',
        `${count} more ${past.length === 1 ? 'box' : 'boxes'} ${EDGES[edge].words}`,
      );
      const words = document.createElement('span');
      words.textContent = `${count} more`;
      hint.replaceChildren(
        words,
        svgOf(
          'svg',
          { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true' },
          svgOf('path', { d: EDGES[edge].arrow }),
        ),
      );
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
  new MutationObserver(() => {
    show(camera.view());
  }).observe(graph, { attributeFilter: ['data-hidden-marks'] });
};

export default edgeHints;
