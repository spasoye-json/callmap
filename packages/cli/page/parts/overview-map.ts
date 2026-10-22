import type { CameraView } from '../camera.ts';
import { hiddenIdsOf } from '../hidden-parts.ts';
import type { SelectedPath } from '../highlight.ts';
import { isOutside } from '../layout.ts';
import type { Laid, Point, Rect } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';

const MAP_WIDTH = 200;
const MAP_HEIGHT = 136;
const MAP_PADDING = 8;

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

const isLargerThanView = (level: Laid, view: CameraView): boolean => {
  if (level.boxes.length === 0) return false;
  const { visible } = view;
  return (
    visible.width > 0 &&
    visible.height > 0 &&
    (level.width > visible.width || level.height > visible.height)
  );
};

const place = (element: HTMLElement, { x, y, width, height }: Rect, at: MapScale): void => {
  Object.assign(element.style, {
    left: `${String(at.left + x * at.scale)}px`,
    top: `${String(at.top + y * at.scale)}px`,
    width: `${String(width * at.scale)}px`,
    height: `${String(height * at.scale)}px`,
  });
};

const overviewMap: PagePart = ({
  graph,
  camera,
  level: levelOf,
  onHighlight,
  hiddenMarks,
  onHiddenMarksChange,
}) => {
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
  let mapBoxes = new Map<string, HTMLElement>();
  let path: SelectedPath = { selected: undefined, connected: new Set() };

  const drawBoxes = (next: Laid): void => {
    level = next;
    at = mapScaleOf(next);
    const hidden = hiddenIdsOf(next, hiddenMarks());
    mapBoxes = new Map(
      next.boxes
        .filter(({ id }) => !hidden.has(id))
        .map((box) => {
          const mapBox = document.createElement('span');
          mapBox.setAttribute('data-map-box', box.id);
          mapBox.classList.toggle('outside', isOutside(box));
          place(mapBox, box, at);
          return [box.id, mapBox];
        }),
    );
    map.replaceChildren(...mapBoxes.values(), rectangle);
  };

  const showPath = (): void => {
    for (const [id, mapBox] of mapBoxes) {
      mapBox.classList.toggle('selected', id === path.selected);
      mapBox.classList.toggle('connected', path.connected.has(id));
    }
  };

  const show = (view: CameraView): void => {
    const current = levelOf();
    const shown = isLargerThanView(current, view);
    map.hidden = !shown;
    graph.toggleAttribute('data-overview-map', shown);
    if (!shown) return;
    if (current !== level) {
      drawBoxes(current);
      showPath();
    }
    place(rectangle, view.visible, at);
  };

  onHiddenMarksChange(() => {
    if (level === undefined) return;
    drawBoxes(level);
    showPath();
  });

  onHighlight((next) => {
    path = next;
    showPath();
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
