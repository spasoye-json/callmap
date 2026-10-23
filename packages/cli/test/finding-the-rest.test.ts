import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  clickBox,
  loadReaderPage,
  reviewHtmlOf,
  settled,
  storedItemsOf,
} from './reader-page.ts';
import type { GraphSize, LoadedPage, Point } from './reader-page.ts';

const CART = 'src/cart.ts';
const RECEIPT = `${CART}#receipt`;

const DENSE: GraphSize = { width: 600, height: 400 };
const ROOMY: GraphSize = { width: 2000, height: 1000 };

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const overviewMapOf = (page: LoadedPage): HTMLElement | null =>
  bodyOf(page).queryByRole('img', { name: /^Overview map/ });

const shownMapOf = (page: LoadedPage): HTMLElement => {
  const map = overviewMapOf(page);
  if (map === null) throw new Error('the page shows no overview map');
  return map;
};

interface Placed {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const placeOf = (element: Element): Placed => {
  const { style } = element as HTMLElement;
  return {
    left: parseFloat(style.left),
    top: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height),
  };
};

const mapBoxOf = (page: LoadedPage, id: string): Element => {
  const box = shownMapOf(page).querySelector(`[data-map-box="${id}"]`);
  if (box === null) throw new Error(`the overview map holds no box ${id}`);
  return box;
};

const viewRectangleOf = (page: LoadedPage): Placed => {
  const rectangle = shownMapOf(page).querySelector('.view');
  if (rectangle === null) throw new Error('the overview map holds no view rectangle');
  return placeOf(rectangle);
};

interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const cameraOf = ({ window }: LoadedPage): Camera => {
  const transform = window.document.querySelector('#graph .viewport')?.getAttribute('transform');
  const [, x = '', y = '', scale = ''] =
    /translate\((-?[\d.e-]+),(-?[\d.e-]+)\) scale\(([\d.e-]+)\)/.exec(transform ?? '') ?? [];
  return { x: Number(x), y: Number(y), scale: Number(scale) };
};

const centreOnScreen = (page: LoadedPage, id: string): Point => {
  const box = boxesOf(page).find((candidate) => candidate.id === id);
  if (box === undefined) throw new Error(`the drawing holds no box ${id}`);
  const { x, y, scale } = cameraOf(page);
  return [x + scale * (box.x + box.width / 2), y + scale * (box.y + box.height / 2)];
};

const pressZoom = (page: LoadedPage, name: string): void => {
  const controls = bodyOf(page).getByRole('group', { name: 'Zoom' });
  fireEvent.click(within(controls).getByRole('button', { name }));
};

describe('the overview map', () => {
  it('shows only when the level is larger than the view', async () => {
    expect(overviewMapOf(await loadReaderPage(html, undefined, undefined, DENSE))).not.toBeNull();
    expect(overviewMapOf(await loadReaderPage(html, undefined, undefined, ROOMY))).toBeNull();
  });

  it('shows every box of the level, and the selected path in blue', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, RECEIPT);
    const ids = boxesOf(page).map(({ id }) => id);
    const marked = (name: string): readonly string[] =>
      [...shownMapOf(page).querySelectorAll(`[data-map-box].${name}`)].map(
        (box) => box.getAttribute('data-map-box') ?? '',
      );
    expect(
      [...shownMapOf(page).querySelectorAll('[data-map-box]')].map(
        (box) => box.getAttribute('data-map-box') ?? '',
      ),
    ).toEqual(ids);
    expect(marked('selected')).toEqual([RECEIPT]);
    expect(marked('connected').length).toBeGreaterThan(0);
    expect(marked('connected')).not.toContain(RECEIPT);
  });

  it('shows the view as a rectangle that shrinks when the reader zooms in', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const before = viewRectangleOf(page);
    expect(before.width / before.height).toBeCloseTo(DENSE.width / DENSE.height);
    pressZoom(page, 'Zoom in');
    expect(viewRectangleOf(page).width).toBeCloseTo(before.width / 1.25);
  });

  it('moves the view to the place of a click on the map', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const target = boxesOf(page).find(({ id }) => {
      const [x] = centreOnScreen(page, id);
      return x > DENSE.width;
    });
    if (target === undefined) throw new Error('every box is on the screen');
    const { left, top, width, height } = placeOf(mapBoxOf(page, target.id));
    const map = shownMapOf(page).getBoundingClientRect();
    fireEvent.pointerDown(shownMapOf(page), {
      clientX: map.left + left + width / 2,
      clientY: map.top + top + height / 2,
      pointerId: 1,
    });
    fireEvent.pointerUp(shownMapOf(page), { pointerId: 1 });
    const [x, y] = centreOnScreen(page, target.id);
    expect(x).toBeCloseTo(DENSE.width / 2, 0);
    expect(y).toBeCloseTo(DENSE.height / 2, 0);
  });

  it('puts the zoom controls above the map while the map shows', async () => {
    const bottomOf = (page: LoadedPage): string =>
      page.window.getComputedStyle(bodyOf(page).getByRole('group', { name: 'Zoom' })).bottom;
    expect(bottomOf(await loadReaderPage(html, undefined, undefined, DENSE))).toBe('164px');
    expect(bottomOf(await loadReaderPage(html, undefined, undefined, ROOMY))).toBe('16px');
  });
});

const mapToggleOf = (page: LoadedPage): HTMLElement | null =>
  within(bodyOf(page).getByRole('group', { name: 'Zoom' })).queryByRole('button', {
    name: 'Overview map',
  });

const shownToggleOf = (page: LoadedPage): HTMLElement => {
  const toggle = mapToggleOf(page);
  if (toggle === null) throw new Error('the zoom controls show no map toggle');
  return toggle;
};

describe('the map toggle', () => {
  it('shows as the last zoom button only when the overview map can show, and controls the open map', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const toggle = shownToggleOf(page);
    const buttons = within(bodyOf(page).getByRole('group', { name: 'Zoom' })).getAllByRole(
      'button',
    );
    expect(buttons.at(-1)).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(shownMapOf(page).id);
    expect(mapToggleOf(await loadReaderPage(html, undefined, undefined, ROOMY))).toBeNull();
  });

  it('collapses the map and drops the zoom controls to the bottom, and opens the map again after a second click', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const zoomBottom = (): string =>
      page.window.getComputedStyle(bodyOf(page).getByRole('group', { name: 'Zoom' })).bottom;
    fireEvent.click(shownToggleOf(page));
    expect(overviewMapOf(page)).toBeNull();
    expect(shownToggleOf(page).getAttribute('aria-expanded')).toBe('false');
    expect(zoomBottom()).toBe('16px');
    fireEvent.click(shownToggleOf(page));
    expect(overviewMapOf(page)).not.toBeNull();
    expect(shownToggleOf(page).getAttribute('aria-expanded')).toBe('true');
    expect(zoomBottom()).toBe('164px');
  });

  it('opens the map again after a reload', async () => {
    const page = await loadReaderPage(html, {}, undefined, DENSE);
    fireEvent.click(shownToggleOf(page));
    const next = await loadReaderPage(html, storedItemsOf(page), undefined, DENSE);
    expect(overviewMapOf(next)).not.toBeNull();
    expect(shownToggleOf(next).getAttribute('aria-expanded')).toBe('true');
  });
});

const onScreen = (page: LoadedPage, size: GraphSize, id: string): boolean => {
  const box = boxesOf(page).find((candidate) => candidate.id === id);
  if (box === undefined) return false;
  const { x, y, scale } = cameraOf(page);
  const left = x + scale * box.x;
  const top = y + scale * box.y;
  return (
    left >= 0 &&
    top >= 0 &&
    left + scale * box.width <= size.width &&
    top + scale * box.height <= size.height
  );
};

const pastRightOf = (page: LoadedPage, size: GraphSize): readonly string[] =>
  boxesOf(page)
    .filter((box) => cameraOf(page).x + cameraOf(page).scale * box.x >= size.width)
    .sort((left, right) => left.x - right.x)
    .map(({ id }) => id);

describe('the edge hints', () => {
  it('names the count of the boxes past the edge', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const past = pastRightOf(page, DENSE);
    expect(past.length).toBeGreaterThan(1);
    const hint = bodyOf(page).getByRole('button', {
      name: `${String(past.length)} more boxes to the right`,
    });
    expect(hint.textContent).toBe(`${String(past.length)} more`);
  });

  it('shows no hint on an edge with no box past it', async () => {
    const page = await loadReaderPage(html, undefined, undefined, ROOMY);
    expect(bodyOf(page).queryByRole('button', { name: /more box(es)? to the/ })).toBeNull();
  });

  it('pans to the nearest box past the edge after a click', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const [nearest] = pastRightOf(page, DENSE);
    if (nearest === undefined) throw new Error('no box is past the right edge');
    fireEvent.click(bodyOf(page).getByRole('button', { name: /more boxes to the right$/ }));
    expect(onScreen(page, DENSE, nearest)).toBe(true);
  });
});

const zoomLabelOf = (page: LoadedPage): string =>
  within(bodyOf(page).getByRole('group', { name: 'Zoom' })).getByText(/%|Overview/).textContent;

const graphBoxOf = (page: LoadedPage, id: string): Element => {
  const box = page.window.document.querySelector(`#graph [data-box="${id}"]`);
  if (box === null) throw new Error(`the drawing holds no box ${id}`);
  return box;
};

const focusBox = (page: LoadedPage, id: string): Element => {
  const box = graphBoxOf(page, id);
  (box as SVGElement).focus();
  return box;
};

const shownIn = ({ window }: LoadedPage, element: Element): boolean => {
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    if (window.getComputedStyle(at).display === 'none') return false;
  }
  return true;
};

const ringOf = (page: LoadedPage, id: string): Element => {
  const ring = graphBoxOf(page, id).querySelector(':scope > .focus-ring');
  if (ring === null) throw new Error(`the box ${id} holds no focus ring`);
  return ring;
};

const numberIn = (element: Element, name: string): number => Number(element.getAttribute(name));

const openName = (page: LoadedPage): string | undefined => {
  const id = page.window.document.querySelector('#graph .box.selected')?.getAttribute('data-box');
  const name = id?.split('#')[1];
  return name !== undefined && bodyOf(page).queryByRole('heading', { name }) !== null
    ? name
    : undefined;
};

const press = (page: LoadedPage, key: string): void => {
  const focused = page.window.document.activeElement;
  if (focused === null) throw new Error('nothing has focus');
  fireEvent.keyDown(focused, { key });
};

describe('the focus ring of a box', () => {
  it('shows an outline ring with a gap around a box with keyboard focus, and Enter selects the box', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    expect(shownIn(page, ringOf(page, RECEIPT))).toBe(false);
    fireEvent.keyDown(page.window.document.body, { key: 'Tab' });
    const box = focusBox(page, RECEIPT);
    fireEvent.keyUp(box, { key: 'Tab' });
    const ring = ringOf(page, RECEIPT);
    const outline = ring.querySelector('rect') ?? ring;
    const shape = boxesOf(page).find(({ id }) => id === RECEIPT);
    expect(shownIn(page, ring)).toBe(true);
    expect(numberIn(outline, 'x')).toBeLessThan(shape?.x ?? 0);
    expect(numberIn(outline, 'width')).toBeGreaterThan(shape?.width ?? 0);
    expect(shownIn(page, ringOf(page, `src/checkout.ts#checkout`))).toBe(false);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box.classList).toContain('selected');
  });
});

describe('the keys of the graph', () => {
  it('fits the level with F and sets 100% with 0', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const box = focusBox(page, RECEIPT);
    fireEvent.keyDown(box, { key: 'f' });
    expect(zoomLabelOf(page)).toBe('Overview');
    fireEvent.keyDown(box, { key: '0' });
    expect(zoomLabelOf(page)).toBe('100%');
  });

  it('fits the level with F after a click on the empty graph', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const drawing = page.window.document.querySelector<SVGSVGElement>('#graph svg.drawing');
    drawing?.focus();
    expect(page.window.document.activeElement === drawing).toBe(true);
    press(page, 'F');
    expect(zoomLabelOf(page)).toBe('Overview');
  });

  it('does nothing with F and 0 when the graph has no focus', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    pressZoom(page, 'Zoom in');
    fireEvent.keyDown(page.window.document.body, { key: 'f' });
    fireEvent.keyDown(page.window.document.body, { key: '0' });
    expect(zoomLabelOf(page)).toBe('125%');
  });

  it('leaves the keys to a button of the graph when the focus is on it', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, `src/checkout.ts#checkout`);
    const controls = bodyOf(page).getByRole('group', { name: 'Zoom' });
    const buttons = [
      within(controls).getByRole('button', { name: 'Zoom in' }),
      bodyOf(page).getAllByRole('button', { name: /more box(es)? / })[0],
    ];
    for (const button of buttons) {
      if (button === undefined) throw new Error('the graph shows no edge hint');
      button.focus();
      for (const key of ['f', '0', 'ArrowRight']) {
        expect(fireEvent.keyDown(button, { key }), `${key} on ${button.className}`).toBe(true);
      }
    }
    expect(zoomLabelOf(page)).toBe('100%');
    expect(openName(page)).toBe('checkout');
  });

  it('moves the selection to the nearest callee with the right arrow, and to the nearest caller with the left arrow', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, `src/checkout.ts#checkout`);
    focusBox(page, `src/checkout.ts#checkout`);
    press(page, 'ArrowRight');
    expect(openName(page)).toBe('receipt');
    press(page, 'ArrowRight');
    expect(openName(page)).toBe('taxed');
    press(page, 'ArrowRight');
    expect(openName(page)).toBe('subtotal');
    press(page, 'ArrowLeft');
    expect(openName(page)).toBe('taxed');
    press(page, 'ArrowLeft');
    expect(openName(page)).toBe('receipt');
    expect(page.window.document.activeElement?.getAttribute('data-box')).toBe(RECEIPT);
    expect(graphBoxOf(page, RECEIPT).classList).toContain('selected');
  });

  it('keeps the selection with an arrow when the selected box has no call that way', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, `src/checkout.ts#checkout`);
    focusBox(page, `src/checkout.ts#checkout`);
    press(page, 'ArrowLeft');
    expect(openName(page)).toBe('checkout');
  });

  it('skips the boxes of a hidden mark with an arrow', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const marks = within(bodyOf(page).getByRole('region', { name: 'Marks' }));
    fireEvent.click(marks.getByRole('button', { name: /^Changed \d+$/ }));
    await clickBox(page, `src/checkout.ts#checkout`);
    focusBox(page, `src/checkout.ts#checkout`);
    press(page, 'ArrowRight');
    expect(openName(page)).toBe('checkout');
    expect(graphBoxOf(page, RECEIPT).classList).not.toContain('selected');
  });
});

describe('the search', () => {
  it('pans to the result and selects it', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const MAIL = 'src/notify.ts#Mail.send';
    expect(onScreen(page, DENSE, MAIL)).toBe(false);
    const body = bodyOf(page);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'Mail.send' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: 'Mail.send src/notify.ts',
      }),
    );
    await settled(page);
    expect(onScreen(page, DENSE, MAIL)).toBe(true);
    expect(graphBoxOf(page, MAIL).classList).toContain('selected');
  });
});
