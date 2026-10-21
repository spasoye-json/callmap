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

const hintOf = (edge: Edge): HTMLButtonElement => {
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = `edge-hint ${edge}`;
  hint.hidden = true;
  return hint;
};

const edgeHints: PagePart = ({ graph, camera, hiddenMarks, onHiddenMarksChange }) => {
  const edges = Object.keys(EDGES) as Edge[];
  const hints = new Map(edges.map((edge) => [edge, hintOf(edge)]));
  const nearest = new Map<Edge, LaidBox>();
  graph.append(...hints.values());

  const hideAll = (): void => {
    for (const hint of hints.values()) hint.hidden = true;
    nearest.clear();
  };

  const show = (view: CameraView): void => {
    const { level } = view;
    const hidden = hiddenIdsOf(level, hiddenMarks());
    const boxes = level.boxes.filter(({ id }) => !hidden.has(id));
    if (boxes.length === 0) {
      hideAll();
      return;
    }
    const { visible, coveredTop } = view;
    hints.get('top')?.style.setProperty('top', `${String(coveredTop + EDGE_GAP)}px`);
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
};

export default edgeHints;
