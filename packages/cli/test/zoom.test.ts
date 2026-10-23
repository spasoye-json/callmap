import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, levelsRepo } from './fixture-repo.ts';
import {
  COVER_HEIGHT,
  boxesOf,
  clickBox,
  framesOf,
  hoverBox,
  loadReaderPage,
  openTab,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { GraphSize, LoadedPage, Point } from './reader-page.ts';

const CART = 'src/cart.ts';
const RECEIPT = `${CART}#receipt`;

const ALERT = 'src/alerts.ts#alert';
const REPORT = 'src/report.ts';

const FRAME_HEADER = 30;
const HEADER_TEXT = 24;

const TINY: GraphSize = { width: 150, height: 100 };
const DENSE: GraphSize = { width: 600, height: 400 };
const FITTING: GraphSize = { width: 1200, height: 500 };
const ROOMY: GraphSize = { width: 2000, height: 1000 };

let html = '';
let levelsHtml = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
  levelsHtml = reviewHtmlOf(levelsRepo());
}, 120_000);

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

describe('the zoom at which a level opens', () => {
  it('opens a dense level at 100%, with the anchor box one third from the left edge', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    expect(cameraOf(page).scale).toBe(1);
    expect(centreOnScreen(page, RECEIPT)[0]).toBeCloseTo(DENSE.width / 3);
  });

  it('opens a small level at its fit zoom, but never above 125%', async () => {
    const page = await loadReaderPage(html, undefined, undefined, ROOMY);
    expect(cameraOf(page).scale).toBe(1.25);
  });

  it('opens a level that fits between 92% and 125% at its fit zoom, with every box on the screen', async () => {
    const page = await loadReaderPage(html, undefined, undefined, FITTING);
    const { scale } = cameraOf(page);
    expect(scale).toBeGreaterThan(1.05);
    expect(scale).toBeLessThan(1.2);
    for (const { id } of boxesOf(page)) {
      const [x, y] = centreOnScreen(page, id);
      expect(x, id).toBeGreaterThan(0);
      expect(x, id).toBeLessThan(FITTING.width);
      expect(y, id).toBeGreaterThan(0);
      expect(y, id).toBeLessThan(FITTING.height);
    }
  });
});

describe('the anchor box of a level', () => {
  it('opens on the selected box when the selected box is on the level', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, ALERT);
    await openTab(page, 'Whole project');
    await openTab(page, 'Diff');
    expect(centreOnScreen(page, ALERT)[0]).toBeCloseTo(DENSE.width / 3);
  });

  it('opens on the box with the most changes when no box on the level is selected', async () => {
    const page = await loadReaderPage(html, undefined, undefined, TINY);
    await openTab(page, 'Whole project');
    expect(centreOnScreen(page, CART)[0]).toBeCloseTo(TINY.width / 3);
  });

  it('opens on the first box of the caller column when no box has a change', async () => {
    const page = await loadReaderPage(html, undefined, undefined, TINY);
    await openTab(page, 'Whole project');
    await clickBox(page, REPORT);
    expect(centreOnScreen(page, `${REPORT}#report`)[0]).toBeCloseTo(TINY.width / 3);
  });
});

const zoomControlsOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('group', { name: 'Zoom' }));

const press = (page: LoadedPage, name: string): void => {
  fireEvent.click(zoomControlsOf(page).getByRole('button', { name }));
};

const zoomLabelOf = (page: LoadedPage): string =>
  zoomControlsOf(page).getByText(/%|Overview/).textContent;

describe('the zoom controls', () => {
  it('shows the zoom as a percentage', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    expect(zoomLabelOf(page)).toBe('100%');
  });

  it('zooms in and out around the middle of the graph', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    press(page, 'Zoom in');
    expect(zoomLabelOf(page)).toBe('125%');
    expect(cameraOf(page).scale).toBe(1.25);
    press(page, 'Zoom out');
    press(page, 'Zoom out');
    expect(cameraOf(page).scale).toBeCloseTo(0.8);
  });

  it('stops at 150% when the reader zooms in', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    for (const _ of [1, 2, 3, 4]) press(page, 'Zoom in');
    expect(zoomLabelOf(page)).toBe('150%');
  });

  it('fits the whole level with Fit, and calls a zoom below 92% "Overview"', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    press(page, 'Fit');
    const { scale } = cameraOf(page);
    expect(scale).toBeLessThan(0.92);
    expect(zoomLabelOf(page)).toBe('Overview');
    for (const { id } of boxesOf(page)) {
      const [x] = centreOnScreen(page, id);
      expect(x, id).toBeGreaterThan(0);
      expect(x, id).toBeLessThan(DENSE.width);
    }
  });
});

const ORDERS = 'src/orders';
const MONEY = 'src/money';

const shownIn = ({ window }: LoadedPage, element: Element): boolean => {
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    if (window.getComputedStyle(at).display === 'none') return false;
  }
  return true;
};

const elementOf = (page: LoadedPage, selector: string): Element => {
  const element = page.window.document.querySelector(`#graph ${selector}`);
  if (element === null) throw new Error(`the drawing holds no ${selector}`);
  return element;
};

const bandOf = (page: LoadedPage): string | null =>
  elementOf(page, 'svg.drawing').getAttribute('data-band');

const nameOf = (page: LoadedPage, id: string): Element =>
  elementOf(page, `[data-box="${id}"] > text.name`);

const countsShownOf = (page: LoadedPage, id: string): readonly string[] =>
  [...page.window.document.querySelectorAll(`#graph [data-box="${id}"] .count`)]
    .filter((count) => shownIn(page, count))
    .map(
      (count) =>
        `${count.getAttribute('data-mark') ?? ''} ${count.getAttribute('data-count') ?? ''}`,
    );

const badgeOf = (page: LoadedPage): Element =>
  elementOf(page, `[data-from="${ORDERS}"][data-to="${MONEY}"] > .badge`);

describe('the zoom bands', () => {
  const projectPageAt = async (zoomOuts: number): Promise<LoadedPage> => {
    const page = await loadReaderPage(levelsHtml, undefined, undefined, DENSE);
    await openTab(page, 'Whole project');
    for (const _ of Array.from({ length: zoomOuts })) press(page, 'Zoom out');
    return page;
  };

  it('shows all names, counts and badges in the Read band, from 92%', async () => {
    const page = await projectPageAt(0);
    expect(bandOf(page)).toBe('read');
    expect(shownIn(page, nameOf(page, ORDERS))).toBe(true);
    expect(countsShownOf(page, ORDERS)).toEqual(['changed 2', 'added 1']);
    expect(shownIn(page, badgeOf(page))).toBe(true);
  });

  it('keeps the names in the Scan band, shows only the biggest count, and badges only on the selected path', async () => {
    const page = await projectPageAt(1);
    expect(bandOf(page)).toBe('scan');
    expect(shownIn(page, nameOf(page, ORDERS))).toBe(true);
    expect(countsShownOf(page, ORDERS)).toEqual(['changed 2']);
    expect(shownIn(page, badgeOf(page))).toBe(false);
    hoverBox(page, ORDERS);
    expect(shownIn(page, badgeOf(page))).toBe(false);
  });

  it('sets the names in the Scan band to 11 px on the screen', async () => {
    const page = await projectPageAt(1);
    const svg = elementOf(page, 'svg.drawing');
    expect(page.window.getComputedStyle(svg).getPropertyValue('--zoom')).toBe('0.8');
    expect(page.window.getComputedStyle(nameOf(page, ORDERS)).fontSize).toBe(
      'calc(11px / var(--zoom))',
    );
  });

  it('cuts the start of a name in the Scan band, so that it ends before the function count', async () => {
    const page = await projectPageAt(1);
    const scale = 0.8;
    const character = 11 * 0.6;
    const boxes = [...page.window.document.querySelectorAll('#graph .box.level:not(.outside)')];
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const name = box.querySelector(':scope > text.name');
      const count = box.querySelector(':scope > text.functions');
      const full = box.querySelector(':scope > title')?.textContent.split('\n')[0] ?? '';
      const shown = name?.textContent ?? '';
      const nameEnd = Number(name?.getAttribute('x')) * scale + shown.length * character;
      const countStart =
        Number(count?.getAttribute('x')) * scale - (count?.textContent.length ?? 0) * character;
      expect(nameEnd, shown).toBeLessThanOrEqual(countStart - 4);
      expect(full.endsWith(shown.replace(/^…/, '')), `${shown} of ${full}`).toBe(true);
    }
    expect(nameOf(page, ORDERS).textContent).toMatch(/^…/);
    press(page, 'Zoom in');
    expect(nameOf(page, ORDERS).textContent).toBe('orders/');
  });

  it('cuts the start of a function name in the Scan band, so that it stays in its box', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    press(page, 'Zoom out');
    expect(bandOf(page)).toBe('scan');
    const scale = 0.8;
    for (const box of page.window.document.querySelectorAll('#graph .box.function')) {
      const name = box.querySelector(':scope > text.name');
      const rect = box.querySelector(':scope > rect');
      const shown = name?.textContent ?? '';
      const nameEnd = Number(name?.getAttribute('x')) * scale + shown.length * 11 * 0.6;
      const boxEnd =
        (Number(rect?.getAttribute('x')) + Number(rect?.getAttribute('width'))) * scale;
      expect(nameEnd, shown).toBeLessThanOrEqual(boxEnd);
    }
  });

  it('sets the count that stays in the Scan band to 11 px on the screen', async () => {
    const page = await projectPageAt(1);
    const count = elementOf(page, `[data-box="${ORDERS}"] .count[data-mark="changed"] > text`);
    expect(page.window.getComputedStyle(count).fontSize).toBe('calc(11px / var(--zoom))');
  });

  it('shows the count chips of a level box in the Map band, below 60%, with no names, numbers or badges', async () => {
    const page = await projectPageAt(3);
    expect(bandOf(page)).toBe('map');
    expect(shownIn(page, nameOf(page, ORDERS))).toBe(false);
    expect(countsShownOf(page, ORDERS)).toEqual(['changed 2', 'added 1']);
    for (const count of page.window.document.querySelectorAll(
      `#graph [data-box="${ORDERS}"] .count`,
    )) {
      expect(shownIn(page, count.querySelector(':scope > .chip') ?? count)).toBe(true);
      expect(shownIn(page, count.querySelector(':scope > text') ?? count)).toBe(false);
    }
    expect(shownIn(page, badgeOf(page))).toBe(false);
  });

  it('hides the "one of" labels in the Map band', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, `${CART}#subtotal`);
    const pill = elementOf(page, '.pill');
    expect(shownIn(page, pill)).toBe(true);
    press(page, 'Fit');
    expect(bandOf(page)).toBe('map');
    expect(shownIn(page, pill)).toBe(false);
  });

  it('shows the chip of a function in the Map band, and its name in a tooltip', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    press(page, 'Fit');
    expect(bandOf(page)).toBe('map');
    const receipt = elementOf(page, `[data-box="${RECEIPT}"]`);
    expect(shownIn(page, nameOf(page, RECEIPT))).toBe(false);
    expect(shownIn(page, elementOf(page, `[data-box="${RECEIPT}"] > .chip`))).toBe(true);
    expect(receipt.querySelector(':scope > title')?.textContent).toBe('receipt');
  });
});

const ownScaleOf = (element: Element): number =>
  Number(/scale\(([\d.e-]+)\)/.exec(element.getAttribute('transform') ?? '')?.[1] ?? '1');

const screenScaleOf = (element: Element): number => {
  let scale = 1;
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    scale *= ownScaleOf(at);
    if (at.classList.contains('viewport')) break;
  }
  return Math.round(scale * 1000) / 1000;
};

const screenScalesOf = (page: LoadedPage, selector: string): readonly number[] =>
  [...page.window.document.querySelectorAll(`#graph ${selector}`)].map((element) =>
    screenScaleOf(element),
  );

describe('the text that keeps its screen size', () => {
  it('keeps the count badges and the "one of" labels at their screen size at every zoom', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, `${CART}#subtotal`);
    expect(page.window.document.querySelector('#graph .pill')).not.toBeNull();
    for (const name of ['Zoom in', 'Zoom out', 'Zoom out', 'Zoom out', 'Fit']) {
      press(page, name);
      const scales = screenScalesOf(page, '.label');
      expect(scales.length).toBeGreaterThan(0);
      expect(new Set(scales), `after ${name}`).toEqual(new Set([1]));
    }
  });

  const headerFitOf = (scale: number, size = 1): number =>
    Math.round(size * Math.min(1, (scale * FRAME_HEADER) / HEADER_TEXT) * 1000) / 1000;

  it('keeps the frame labels at their screen size while they fit the frame header, and shrinks them with the frame below that', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    for (const name of ['Zoom in', 'Zoom out', 'Zoom out', 'Zoom out', 'Fit']) {
      press(page, name);
      const scales = screenScalesOf(page, '.frame > text');
      expect(scales.length).toBeGreaterThan(0);
      expect(new Set(scales), `after ${name}`).toEqual(
        new Set([headerFitOf(cameraOf(page).scale)]),
      );
    }
  });

  it('keeps the folder icon of a frame at its screen size while it fits the frame header', async () => {
    const page = await loadReaderPage(levelsHtml, undefined, undefined, DENSE);
    await openTab(page, 'Whole project');
    await clickBox(page, ORDERS);
    for (const name of ['Zoom in', 'Zoom out', 'Zoom out', 'Fit']) {
      press(page, name);
      const scales = screenScalesOf(page, '.frame .icon');
      expect(scales.length).toBeGreaterThan(0);
      const expected = headerFitOf(cameraOf(page).scale, 0.75);
      expect(new Set(scales), `after ${name}`).toEqual(new Set([expected]));
    }
  });

  it('keeps every frame label inside the width of its frame at every zoom', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    for (const name of ['Zoom in', 'Zoom out', 'Zoom out', 'Zoom out', 'Fit']) {
      press(page, name);
      const { scale } = cameraOf(page);
      for (const frame of page.window.document.querySelectorAll('#graph .frame')) {
        const label = frame.querySelector(':scope > text');
        const width = Number(frame.querySelector(':scope > rect')?.getAttribute('width'));
        const shown =
          (Number(label?.getAttribute('x')) + (label?.textContent.length ?? 0) * 11 * 0.6) *
          (label === null ? 1 : screenScaleOf(label));
        expect(shown, `${label?.textContent ?? ''} after ${name}`).toBeLessThanOrEqual(
          width * scale,
        );
      }
    }
  });

  it('cuts the start of the path of a narrow frame, and keeps the file name', async () => {
    const page = await loadReaderPage(html, undefined, undefined, { width: 300, height: 200 });
    press(page, 'Fit');
    const labels = new Map(framesOf(page).map(({ id, label }) => [id, label]));
    expect(labels.get('frame:src/checkout.ts')).toBe('…/checkout.ts');
    expect(labels.get(`frame:${CART}`)).toBe(CART);
    for (const _ of [1, 2, 3, 4, 5, 6]) press(page, 'Zoom in');
    expect(framesOf(page).find(({ id }) => id === 'frame:src/checkout.ts')?.label).toBe(
      'src/checkout.ts',
    );
  });
});

describe('the level bar over the graph', () => {
  const FLAT: GraphSize = { width: 2000, height: 130 };

  const topsOnScreen = (page: LoadedPage): readonly number[] => {
    const { y, scale } = cameraOf(page);
    return boxesOf(page).map((box) => y + scale * box.y);
  };

  it('leaves the bar out when a level opens and when the reader fits it', async () => {
    const page = await loadReaderPage(levelsHtml, undefined, undefined, FLAT);
    await openTab(page, 'Whole project');
    expect(Math.min(...topsOnScreen(page))).toBeGreaterThanOrEqual(COVER_HEIGHT);
    press(page, 'Fit');
    expect(Math.min(...topsOnScreen(page))).toBeGreaterThanOrEqual(COVER_HEIGHT);
    expect(
      Math.max(
        ...boxesOf(page).map(
          (box) => cameraOf(page).y + cameraOf(page).scale * (box.y + box.height),
        ),
      ),
    ).toBeLessThanOrEqual(FLAT.height);
  });
});

describe('the zoom controls and the overview map over the graph', () => {
  interface ScreenRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }

  const cornerOf = ({ window }: LoadedPage): ScreenRect => {
    const shown = [
      ...window.document.querySelectorAll('#graph > .zoom-controls, #graph > .overview-map'),
    ]
      .map((element) => element.getBoundingClientRect())
      .filter(({ width }) => width > 0);
    return {
      left: Math.min(...shown.map(({ left }) => left)),
      top: Math.min(...shown.map(({ top }) => top)),
      right: Math.max(...shown.map(({ right }) => right)),
      bottom: Math.max(...shown.map(({ bottom }) => bottom)),
    };
  };

  const screenRectOf = (page: LoadedPage, id: string): ScreenRect => {
    const box = boxesOf(page).find((candidate) => candidate.id === id);
    if (box === undefined) throw new Error(`the drawing holds no box ${id}`);
    const { x, y, scale } = cameraOf(page);
    return {
      left: x + scale * box.x,
      top: y + scale * box.y,
      right: x + scale * (box.x + box.width),
      bottom: y + scale * (box.y + box.height),
    };
  };

  const meets = (one: ScreenRect, other: ScreenRect): boolean =>
    one.left < other.right &&
    other.left < one.right &&
    one.top < other.bottom &&
    other.top < one.bottom;

  const inGraph = (rect: ScreenRect, size: GraphSize): boolean =>
    rect.left >= 0 && rect.top >= 0 && rect.right <= size.width && rect.bottom <= size.height;

  const drawingOf = ({ window }: LoadedPage): Element => {
    const drawing = window.document.querySelector('#graph svg.drawing');
    if (drawing === null) throw new Error('the page holds no drawing');
    return drawing;
  };

  const moveBoxTo = (page: LoadedPage, id: string, [atX, atY]: Point): void => {
    const [fromX, fromY] = centreOnScreen(page, id);
    const drawing = drawingOf(page);
    fireEvent.pointerDown(drawing, { clientX: fromX, clientY: fromY, pointerId: 1 });
    fireEvent.pointerMove(drawing, { clientX: atX, clientY: atY, pointerId: 1 });
    fireEvent.pointerUp(drawing, { pointerId: 1 });
    fireEvent.pointerDown(drawing, { clientX: atX, clientY: atY, pointerId: 1 });
    fireEvent.pointerUp(drawing, { pointerId: 1 });
  };

  const middleOf = ({ left, top, right, bottom }: ScreenRect): Point => [
    (left + right) / 2,
    (top + bottom) / 2,
  ];

  const toggleMap = (page: LoadedPage): void => {
    press(page, 'Overview map');
  };

  it('pans a clicked box out from under the overview map', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    const map = page.window.document.querySelector('#graph > .overview-map');
    if (map === null) throw new Error('the page shows no overview map');
    moveBoxTo(page, RECEIPT, middleOf(map.getBoundingClientRect()));
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(true);
    await clickBox(page, RECEIPT);
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(false);
    expect(inGraph(screenRectOf(page, RECEIPT), DENSE)).toBe(true);
  });

  it('leaves a clicked box where the collapsed map was, and pans it out when the map opens', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    await clickBox(page, RECEIPT);
    const mapPlace = page.window.document
      .querySelector('#graph > .overview-map')
      ?.getBoundingClientRect();
    if (mapPlace === undefined) throw new Error('the page shows no overview map');
    toggleMap(page);
    const { left, top, right, bottom } = screenRectOf(page, RECEIPT);
    const [width, height] = [right - left, bottom - top];
    moveBoxTo(page, RECEIPT, [DENSE.width - 30 - width / 2, mapPlace.top + 4 + height / 2]);
    expect(meets(screenRectOf(page, RECEIPT), mapPlace)).toBe(true);
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(false);
    const before = cameraOf(page);
    await clickBox(page, RECEIPT);
    expect(cameraOf(page)).toEqual(before);
    toggleMap(page);
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(false);
    expect(inGraph(screenRectOf(page, RECEIPT), DENSE)).toBe(true);
  });

  const SMALL: GraphSize = { width: 400, height: 300 };

  it('opens a level with the anchor box clear of the corner', async () => {
    const page = await loadReaderPage(html, undefined, undefined, SMALL);
    await clickBox(page, RECEIPT);
    await openTab(page, 'Whole project');
    await openTab(page, 'Diff');
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(false);
    expect(inGraph(screenRectOf(page, RECEIPT), SMALL)).toBe(true);
  });

  it('keeps the search result clear of the corner', async () => {
    const MAIL = 'src/notify.ts#Mail.send';
    const page = await loadReaderPage(html, undefined, undefined, SMALL);
    const body = within(page.window.document.body);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'Mail.send' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: 'Mail.send src/notify.ts',
      }),
    );
    await settled(page);
    expect(meets(screenRectOf(page, MAIL), cornerOf(page))).toBe(false);
    expect(inGraph(screenRectOf(page, MAIL), SMALL)).toBe(true);
  });

  it('pans a clicked box out from under the zoom controls while the map is collapsed', async () => {
    const page = await loadReaderPage(html, undefined, undefined, DENSE);
    toggleMap(page);
    moveBoxTo(page, RECEIPT, middleOf(cornerOf(page)));
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(true);
    await clickBox(page, RECEIPT);
    expect(meets(screenRectOf(page, RECEIPT), cornerOf(page))).toBe(false);
    expect(inGraph(screenRectOf(page, RECEIPT), DENSE)).toBe(true);
  });
});
