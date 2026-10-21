import { highlightOf } from './highlight.ts';
import type { SelectedPath } from './highlight.ts';
import { bandOf, cameraOf } from './camera.ts';
import type { SteeredCamera } from './camera.ts';
import type { Laid, LaidBox, LaidFunction, LaidLevelBox, LaidLine } from './layout.ts';
import { isLevelBox } from './scene.ts';
import { arrowsOf, boxOf, endMarksOf, frameOf, lineOf } from './shapes.ts';
import { fitNames, keepScreenSize } from './screen-size.ts';
import { svgOf } from './svg.ts';

export interface Drawing {
  readonly camera: SteeredCamera;
  readonly level: () => Laid;
  readonly onLevelChange: (handler: (level: Laid) => void) => void;
  readonly draw: (laid: Laid, anchor?: string) => void;
  readonly highlight: (selected: string | undefined, hovered?: string) => void;
  readonly onBoxClick: (handler: (box: LaidFunction) => void) => void;
  readonly onLevelBoxClick: (handler: (box: LaidLevelBox) => void) => void;
  readonly onLineClick: (handler: (line: LaidLine) => void) => void;
  readonly onEmptyClick: (handler: () => void) => void;
  readonly onBoxHover: (handler: (id: string | undefined) => void) => void;
  readonly onHighlight: (handler: (path: SelectedPath) => void) => void;
}

const dataCountOf = (entry: Element): number => Number(entry.getAttribute('data-count'));

const markBiggestCounts = (root: Element): void => {
  for (const counts of root.querySelectorAll('.counts')) {
    const biggest = [...counts.querySelectorAll(':scope > .count')].reduce<Element | undefined>(
      (best, entry) =>
        best === undefined || dataCountOf(entry) > dataCountOf(best) ? entry : best,
      undefined,
    );
    biggest?.classList.add('biggest');
  }
};

export const drawingOf = (container: HTMLElement): Drawing => {
  const viewport = svgOf('g', { class: 'viewport' });
  const svg = svgOf('svg', { class: 'drawing', tabindex: -1 }, arrowsOf(), viewport);
  container.append(svg);

  let laid: Laid = { frames: [], boxes: [], lines: [], width: 0, height: 0 };
  const camera = cameraOf(
    container,
    svg,
    viewport,
    () => laid,
    (scale) => {
      keepScreenSize(viewport, scale);
      fitNames(viewport, scale, bandOf(scale) === 'scan');
    },
  );
  const levelHandlers: ((level: Laid) => void)[] = [];
  const handlers: ((box: LaidFunction) => void)[] = [];
  const levelBoxHandlers: ((box: LaidLevelBox) => void)[] = [];
  const lineHandlers: ((line: LaidLine) => void)[] = [];
  const emptyHandlers: (() => void)[] = [];
  const hoverHandlers: ((id: string | undefined) => void)[] = [];
  const highlightHandlers: ((path: SelectedPath) => void)[] = [];

  const boxOfId = (id: string): LaidBox | undefined => laid.boxes.find((box) => box.id === id);

  const highlight = (selected: string | undefined, hovered?: string): void => {
    const onPath = selected === undefined ? undefined : highlightOf(laid, selected);
    const lit = hovered === undefined ? onPath : highlightOf(laid, hovered);
    for (const element of viewport.querySelectorAll('[data-box], [data-line]')) {
      const box = element.getAttribute('data-box');
      const line = Number(element.getAttribute('data-line'));
      const isCentre = box !== null && box === lit?.selected;
      const connected = box === null ? lit?.lines.has(line) : lit?.boxes.has(box);
      element.classList.toggle('selected', box !== null && box === selected);
      element.classList.toggle('hovered', isCentre && box !== selected);
      element.classList.toggle('connected', connected === true);
      element.classList.toggle('selected-path', box === null && onPath?.lines.has(line) === true);
      element.classList.toggle('faded', lit !== undefined && !isCentre && connected !== true);
    }
    const path: SelectedPath = { selected, connected: onPath?.boxes ?? new Set() };
    for (const handler of highlightHandlers) handler(path);
  };

  const draw = (next: Laid, anchor?: string): void => {
    const before = anchor === undefined ? undefined : boxOfId(anchor);
    laid = next;
    const after = anchor === undefined ? undefined : boxOfId(anchor);
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
    markBiggestCounts(viewport);
    camera.showNewLevel(
      before !== undefined && after !== undefined ? { before, after } : undefined,
    );
    for (const handler of levelHandlers) handler(next);
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

  const fireBoxClick = (box: LaidFunction): void => {
    for (const handler of handlers) handler(box);
  };
  const fireLineClick = (line: LaidLine): void => {
    for (const handler of lineHandlers) handler(line);
  };
  const fireLevelBoxClick = (box: LaidLevelBox): void => {
    for (const handler of levelBoxHandlers) handler(box);
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
    if (camera.takeDrag()) return;
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

  return {
    camera,
    level: () => laid,
    onLevelChange: (handler) => {
      levelHandlers.push(handler);
    },
    draw,
    highlight,
    onBoxClick: (handler) => {
      handlers.push(handler);
    },
    onLevelBoxClick: (handler) => {
      levelBoxHandlers.push(handler);
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
    onHighlight: (handler) => {
      highlightHandlers.push(handler);
    },
  };
};
