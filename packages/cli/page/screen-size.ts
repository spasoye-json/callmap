import { FRAME_HEADER_HEIGHT, SMALL_CHARACTER_WIDTH } from './box-sizes.ts';
import type { Point, Rect } from './layout.ts';

const KEEP_SIZE = 'data-keep-size';
const IN_HEADER = 'data-in-header';
const HEADER_TEXT_HEIGHT = 24;
const PATH = 'data-path';
const ROOM = 'data-room';

export const keptSizeAt = (x: number, y: number): Readonly<Record<string, string>> => {
  const at = `${String(x)},${String(y)}`;
  return { [KEEP_SIZE]: at, transform: `translate(${at})` };
};

export const keptInHeaderAt = (x: number, y: number): Readonly<Record<string, string>> => ({
  ...keptSizeAt(x, y),
  [IN_HEADER]: '',
});

const headerFitOf = (scale: number): number =>
  Math.min(1, (scale * FRAME_HEADER_HEIGHT) / HEADER_TEXT_HEIGHT);

export const pathLabelAttributes = (
  path: string,
  room: number,
): Readonly<Record<string, string>> => ({ [PATH]: path, [ROOM]: String(room) });

const fitsIn = (text: string, room: number): boolean => text.length * SMALL_CHARACTER_WIDTH <= room;

export const pathLabelOf = (path: string, room: number): string => {
  if (fitsIn(path, room)) return path;
  const parts = path.match(/[^/]+\/?/g) ?? [path];
  const cuts = parts.slice(1).map((_, index) => `…/${parts.slice(index + 1).join('')}`);
  return cuts.find((cut) => fitsIn(cut, room)) ?? cuts.at(-1) ?? path;
};

const NAME = 'data-name';
const NAME_ROOM = 'data-name-room';
const BESIDE = 'data-beside';
const BESIDE_GAP = 8;

export const nameAttributes = (
  name: string,
  room: number,
  beside = '',
): Readonly<Record<string, string>> => ({
  [NAME]: name,
  [NAME_ROOM]: String(room),
  [BESIDE]: String(beside.length),
});

export const nameThatFits = (name: string, room: number): string => {
  const cut = pathLabelOf(name, room);
  if (fitsIn(cut, room)) return cut;
  const characters = Math.max(1, Math.floor(room / SMALL_CHARACTER_WIDTH) - 1);
  return `…${cut.slice(-characters)}`;
};

const CROWDED = 'data-crowded';

export const fitNames = (root: Element, scale: number, scan: boolean): void => {
  for (const name of root.querySelectorAll(`[${NAME}]`)) {
    const full = name.getAttribute(NAME) ?? '';
    const beside = Number(name.getAttribute(BESIDE));
    const room = Number(name.getAttribute(NAME_ROOM)) * scale;
    const roomBeside = beside === 0 ? room : room - beside * SMALL_CHARACTER_WIDTH - BESIDE_GAP;
    const besideName = nameThatFits(full, roomBeside);
    const crowded = scan && beside > 0 && !fitsIn(besideName, roomBeside);
    name.parentElement?.toggleAttribute(CROWDED, crowded);
    if (!scan) name.textContent = full;
    else name.textContent = crowded ? nameThatFits(full, room) : besideName;
  }
};

const sizeOf = (element: Element, scale: number): number =>
  element.hasAttribute(IN_HEADER) ? headerFitOf(scale) : 1;

export const keepScreenSize = (root: Element, scale: number): void => {
  for (const element of root.querySelectorAll(`[${KEEP_SIZE}]`)) {
    const at = element.getAttribute(KEEP_SIZE) ?? '0,0';
    const size = sizeOf(element, scale);
    element.setAttribute('transform', `translate(${at}) scale(${String(size / scale)})`);
  }
  for (const label of root.querySelectorAll(`[${PATH}]`)) {
    const room =
      (Number(label.getAttribute(ROOM)) * scale) / sizeOf(label, scale) -
      Number(label.getAttribute('x'));
    label.textContent = nameThatFits(label.getAttribute(PATH) ?? '', room);
  }
};

const MAP_PLACE = 'data-map-place';
const MAP_FIT = 'data-map-fit';
const MAP_INSET = 3;

export interface ChipRow {
  readonly width: number;
  readonly height: number;
}

export const mapChipAttributes = (
  box: Rect,
  row: ChipRow,
  offset: number,
  [chipX, chipY]: Point,
): Readonly<Record<string, string>> => ({
  [MAP_PLACE]: [
    box.x + box.width / 2,
    box.y + box.height / 2,
    offset - row.width / 2 - chipX,
    -row.height / 2 - chipY,
  ].join(','),
  [MAP_FIT]: [box.width - 2 * MAP_INSET, box.height - 2 * MAP_INSET, row.width, row.height].join(
    ',',
  ),
});

const numbersOf = (element: Element, name: string): readonly number[] =>
  (element.getAttribute(name) ?? '').split(',').map(Number);

export const placeChipsForMap = (root: Element, scale: number, map: boolean): void => {
  for (const chip of root.querySelectorAll(`[${MAP_PLACE}]`)) {
    if (!map) {
      chip.removeAttribute('transform');
      continue;
    }
    const [x = 0, y = 0, shiftX = 0, shiftY = 0] = numbersOf(chip, MAP_PLACE);
    const [roomWidth = 0, roomHeight = 0, width = 1, height = 1] = numbersOf(chip, MAP_FIT);
    const size = Math.min(1, (scale * roomWidth) / width, (scale * roomHeight) / height);
    chip.setAttribute(
      'transform',
      `translate(${String(x)},${String(y)}) scale(${String(size / scale)}) translate(${String(shiftX)},${String(shiftY)})`,
    );
  }
};
