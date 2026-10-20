const KEEP_SIZE = 'data-keep-size';
const PATH = 'data-path';
const ROOM = 'data-room';
const PATH_CHARACTER_WIDTH = 6.6;

export const keptSizeAt = (x: number, y: number): Readonly<Record<string, string>> => {
  const at = `${String(x)},${String(y)}`;
  return { [KEEP_SIZE]: at, transform: `translate(${at})` };
};

export const pathLabelAttributes = (
  path: string,
  room: number,
): Readonly<Record<string, string>> => ({ [PATH]: path, [ROOM]: String(room) });

export const pathLabelOf = (path: string, room: number): string => {
  const fits = (text: string): boolean => text.length * PATH_CHARACTER_WIDTH <= room;
  if (fits(path)) return path;
  const parts = path.match(/[^/]+\/?/g) ?? [path];
  const cuts = parts.slice(1).map((_, index) => `…/${parts.slice(index + 1).join('')}`);
  return cuts.find(fits) ?? cuts.at(-1) ?? path;
};

export const keepScreenSize = (root: Element, scale: number): void => {
  for (const element of root.querySelectorAll(`[${KEEP_SIZE}]`)) {
    const at = element.getAttribute(KEEP_SIZE) ?? '0,0';
    element.setAttribute('transform', `translate(${at}) scale(${String(1 / scale)})`);
  }
  for (const label of root.querySelectorAll(`[${PATH}]`)) {
    const room = Number(label.getAttribute(ROOM)) * scale - Number(label.getAttribute('x'));
    label.textContent = pathLabelOf(label.getAttribute(PATH) ?? '', room);
  }
};
