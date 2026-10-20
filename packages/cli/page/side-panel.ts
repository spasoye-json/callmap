import { svgOf } from './svg.ts';

export type Side = 'left' | 'right';

export interface SidePanelOptions {
  readonly side: Side;
  readonly label: string;
  readonly name: string;
  readonly body: HTMLElement;
  readonly widthKey: string;
  readonly defaultWidth: number;
  readonly open: boolean;
  readonly onChange: () => void;
}

export interface SidePanel {
  readonly element: HTMLElement;
  readonly open: () => void;
  readonly collapse: () => void;
}

const MIN_WIDTH = 220;
const KEY_STEP = 40;
const SMALLEST_GRAPH = 240;
const ARROWS: Readonly<Record<Side, Readonly<Record<string, number>>>> = {
  left: { ArrowRight: KEY_STEP, ArrowLeft: -KEY_STEP },
  right: { ArrowLeft: KEY_STEP, ArrowRight: -KEY_STEP },
};
const POINTS_LEFT = 'M8 4L4 8l4 4M12 4L8 8l4 4';
const POINTS_RIGHT = 'M4 4l4 4-4 4M8 4l4 4-4 4';
const TOGGLE_ICON: Readonly<Record<Side, readonly [string, string]>> = {
  left: [POINTS_LEFT, POINTS_RIGHT],
  right: [POINTS_RIGHT, POINTS_LEFT],
};

const storedWidth = (key: string): number | undefined => {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
};

const storeWidth = (key: string, width: number): void => {
  try {
    window.localStorage.setItem(key, String(width));
  } catch {
    return;
  }
};

export const sidePanelOf = (options: SidePanelOptions): SidePanel => {
  const { side, label, name, body, widthKey, defaultWidth, onChange } = options;
  const element = document.createElement('aside');
  element.className = `side-panel ${side}`;
  element.setAttribute('aria-label', label);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'side-toggle';
  const toggleIcon = svgOf('path');
  toggle.append(svgOf('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, toggleIcon));
  const bar = document.createElement('div');
  bar.className = 'side-bar';
  bar.append(toggle);

  const edge = document.createElement('div');
  edge.className = 'side-edge';
  edge.tabIndex = 0;
  edge.setAttribute('role', 'separator');
  edge.setAttribute('aria-orientation', 'vertical');
  edge.setAttribute('aria-label', `Width of the ${name}`);
  edge.setAttribute('aria-valuemin', String(MIN_WIDTH));

  body.classList.add('side-body');
  element.append(bar, body, edge);

  const largest = (): number => Math.max(MIN_WIDTH, window.innerWidth - SMALLEST_GRAPH);
  const width = (): number => Number(edge.getAttribute('aria-valuenow'));
  const resize = (next: number): void => {
    const bounded = Math.round(Math.min(largest(), Math.max(MIN_WIDTH, next)));
    element.style.setProperty('--panel-width', `${String(bounded)}px`);
    edge.setAttribute('aria-valuenow', String(bounded));
    edge.setAttribute('aria-valuemax', String(largest()));
  };
  resize(storedWidth(widthKey) ?? defaultWidth);

  const show = (open: boolean): void => {
    element.classList.toggle('collapsed', !open);
    body.hidden = !open;
    edge.hidden = !open;
    const action = open ? 'Collapse' : 'Open';
    toggle.setAttribute('aria-label', `${action} the ${name}`);
    toggle.title = `${action} the ${name}`;
    toggle.setAttribute('aria-expanded', String(open));
    toggleIcon.setAttribute('d', TOGGLE_ICON[side][open ? 0 : 1]);
  };
  const open = (): void => {
    show(true);
    onChange();
  };
  const collapse = (): void => {
    show(false);
    onChange();
  };
  show(options.open);
  toggle.addEventListener('click', () => {
    if (element.classList.contains('collapsed')) open();
    else collapse();
  });

  const direction = side === 'left' ? 1 : -1;
  let drag: { readonly x: number; readonly width: number } | undefined;
  edge.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drag = { x: event.clientX, width: width() };
    if ('setPointerCapture' in edge) edge.setPointerCapture(event.pointerId);
    element.classList.add('resizing');
  });
  edge.addEventListener('pointermove', (event) => {
    if (drag !== undefined) resize(drag.width + direction * (event.clientX - drag.x));
  });
  const endDrag = (): void => {
    if (drag === undefined) return;
    drag = undefined;
    element.classList.remove('resizing');
    storeWidth(widthKey, width());
    onChange();
  };
  edge.addEventListener('pointerup', endDrag);
  edge.addEventListener('pointercancel', endDrag);
  edge.addEventListener('keydown', (event) => {
    const step = ARROWS[side][event.key];
    if (step === undefined) return;
    event.preventDefault();
    resize(width() + step);
    storeWidth(widthKey, width());
    onChange();
  });

  return { element, open, collapse };
};
