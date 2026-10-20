import type { CameraView } from '../camera.ts';
import type { Laid, LaidBox, Point, Rect } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';

const MAP_WIDTH = 200;
const MAP_HEIGHT = 136;
const MAP_PADDING = 8;
const PATH_STATES = ['selected', 'connected'] as const;

interface MapScale {
  readonly scale: number;
  readonly left: number;
  readonly top: number;
}

const mapScaleOf = ({ width, height }: Laid): MapScale => {
  const scale = Math.min(
    (MAP_WIDTH - 2 * MAP_PADDING) / width,
    (MAP_HEIGHT - 2 * MAP_PADDING) / height,
  );
  return {
    scale,
    left: (MAP_WIDTH - width * scale) / 2,
    top: (MAP_HEIGHT - height * scale) / 2,
  };
};

const isLargerThanView = ({ level, visible }: CameraView): boolean =>
  visible.width > 0 &&
  visible.height > 0 &&
  (level.width > visible.width || level.height > visible.height);

const place = (element: HTMLElement, { x, y, width, height }: Rect, at: MapScale): void => {
  Object.assign(element.style, {
    left: `${String(at.left + x * at.scale)}px`,
    top: `${String(at.top + y * at.scale)}px`,
    width: `${String(width * at.scale)}px`,
    height: `${String(height * at.scale)}px`,
  });
};

const isOutside = (box: LaidBox): boolean => box.kind !== 'open-end' && box.outside;

const overviewMap: PagePart = ({ graph, camera }) => {
  const map = document.createElement('div');
  map.className = 'overview-map';
  map.setAttribute('role', 'img');
  map.setAttribute('aria-label', 'Overview map');
  const rectangle = document.createElement('div');
  rectangle.className = 'view';
  map.append(rectangle);
  graph.append(map);

  let level: Laid | undefined;
  let at: MapScale = { scale: 1, left: 0, top: 0 };
  let marks = new Map<string, HTMLElement>();

  const drawBoxes = (next: Laid): void => {
    level = next;
    at = mapScaleOf(next);
    marks = new Map(
      next.boxes.map((box) => {
        const mark = document.createElement('span');
        mark.setAttribute('data-map-box', box.id);
        mark.classList.toggle('outside', isOutside(box));
        place(mark, box, at);
        return [box.id, mark];
      }),
    );
    map.replaceChildren(...marks.values(), rectangle);
  };

  const showPath = (): void => {
    for (const [id, mark] of marks) {
      const drawn = graph.querySelector(`[data-box="${CSS.escape(id)}"]`);
      for (const state of PATH_STATES)
        mark.classList.toggle(state, drawn?.classList.contains(state) === true);
    }
  };

  const show = (view: CameraView): void => {
    const shown = isLargerThanView(view);
    map.hidden = !shown;
    graph.toggleAttribute('data-overview-map', shown);
    if (!shown) return;
    if (view.level !== level) {
      drawBoxes(view.level);
      showPath();
    }
    place(rectangle, view.visible, at);
  };

  new MutationObserver(showPath).observe(graph.querySelector(':scope > svg') ?? graph, {
    subtree: true,
    attributeFilter: ['class'],
  });

  const pointAt = (event: PointerEvent): Point => {
    const bounds = map.getBoundingClientRect();
    return [
      (event.clientX - bounds.left - map.clientLeft - at.left) / at.scale,
      (event.clientY - bounds.top - map.clientTop - at.top) / at.scale,
    ];
  };

  let dragging = false;
  map.addEventListener('pointerdown', (event) => {
    dragging = true;
    if ('setPointerCapture' in map) map.setPointerCapture(event.pointerId);
    camera.centreOn(pointAt(event));
  });
  map.addEventListener('pointermove', (event) => {
    if (dragging) camera.centreOn(pointAt(event));
  });
  const endDrag = (): void => {
    dragging = false;
  };
  map.addEventListener('pointerup', endDrag);
  map.addEventListener('pointercancel', endDrag);

  show(camera.view());
  camera.onChange(show);
};

export default overviewMap;
