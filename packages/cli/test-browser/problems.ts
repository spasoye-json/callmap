export const problemsOnPage = (): string[] => {
  const TOLERANCE = 0.5;
  const NAME_GAP = 2;
  const drawing = document.querySelector('#graph .drawing');
  const zoom = drawing === null ? '' : getComputedStyle(drawing).getPropertyValue('--zoom');
  const shown = (element: Element): boolean =>
    element.getBoundingClientRect().width > 0 &&
    element.checkVisibility({ visibilityProperty: true });
  const across = (inner: DOMRect, outer: DOMRect): boolean =>
    inner.left >= outer.left - TOLERANCE && inner.right <= outer.right + TOLERANCE;
  const inside = (inner: DOMRect, outer: DOMRect): boolean =>
    across(inner, outer) &&
    inner.top >= outer.top - TOLERANCE &&
    inner.bottom <= outer.bottom + TOLERANCE;
  const meets = (one: DOMRect, other: DOMRect): boolean =>
    one.left < other.right &&
    other.left < one.right &&
    one.top < other.bottom &&
    other.top < one.bottom;
  const shapeOf = (group: Element): DOMRect | undefined =>
    group.querySelector(':scope > rect')?.getBoundingClientRect();
  const quoted = (element: Element): string => `"${element.textContent}"`;

  const problems: string[] = [];
  const boxes = [...document.querySelectorAll('#graph .box')];
  const boxShapes = boxes.flatMap((box) => shapeOf(box) ?? []);

  for (const box of boxes) {
    const shape = shapeOf(box);
    if (shape === undefined) continue;
    const id = box.getAttribute('data-box') ?? '';
    for (const text of box.querySelectorAll('text')) {
      if (shown(text) && !across(text.getBoundingClientRect(), shape))
        problems.push(`${quoted(text)} runs past its box ${id}`);
    }
    const name = box.querySelector(':scope > text.name');
    const functions = box.querySelector(':scope > text.functions');
    if (name !== null && functions !== null && shown(name) && shown(functions)) {
      if (name.getBoundingClientRect().right > functions.getBoundingClientRect().left - NAME_GAP)
        problems.push(`${quoted(name)} runs over its count ${quoted(functions)} in box ${id}`);
    }
  }

  for (const frame of document.querySelectorAll('#graph .frame')) {
    const shape = shapeOf(frame);
    if (shape === undefined) continue;
    const id = frame.getAttribute('data-frame') ?? '';
    for (const text of frame.querySelectorAll('text')) {
      if (!shown(text)) continue;
      const label = text.getBoundingClientRect();
      if (!inside(label, shape)) problems.push(`frame label ${quoted(text)} runs past frame ${id}`);
      else if (boxShapes.some((box) => meets(label, box)))
        problems.push(`frame label ${quoted(text)} runs over a box in frame ${id}`);
    }
  }

  for (const pill of document.querySelectorAll('#graph .label.pill')) {
    if (shown(pill) && boxShapes.some((box) => meets(pill.getBoundingClientRect(), box)))
      problems.push(`"one of" label ${quoted(pill)} runs over a box`);
  }

  return problems.map((problem) => `zoom ${zoom}: ${problem}`);
};

export const hintsOverBoxes = (): { hints: number; covers: string[] } => {
  const CLEARANCE = 2;
  const shown = (element: Element): boolean =>
    element.getBoundingClientRect().width > 0 &&
    element.checkVisibility({ visibilityProperty: true });
  const meets = (one: DOMRect, other: DOMRect): boolean =>
    one.left < other.right + CLEARANCE &&
    other.left < one.right + CLEARANCE &&
    one.top < other.bottom + CLEARANCE &&
    other.top < one.bottom + CLEARANCE;
  const graph = document.querySelector('#graph')?.getBoundingClientRect();
  const hints = [...document.querySelectorAll('#graph .edge-hint')].filter(shown);
  const boxes = [...document.querySelectorAll('#graph .box')].flatMap((box) => {
    const shape = box.querySelector(':scope > rect');
    if (shape === null || !shown(shape) || graph === undefined) return [];
    const rect = shape.getBoundingClientRect();
    const onScreen =
      rect.right > graph.left &&
      rect.left < graph.right &&
      rect.bottom > graph.top &&
      rect.top < graph.bottom;
    return onScreen ? [{ id: box.getAttribute('data-box') ?? '', rect }] : [];
  });
  const covers = hints.flatMap((hint) => {
    const rect = hint.getBoundingClientRect();
    return boxes
      .filter((box) => meets(rect, box.rect))
      .map((box) => `the edge hint "${hint.textContent}" covers the box ${box.id}`);
  });
  return { hints: hints.length, covers };
};

export const zoomLabelRoom = (): {
  text: string;
  controls: number;
  left: number;
  right: number;
} => {
  const controls = document.querySelector('#graph .zoom-controls');
  const label = controls?.querySelector('.zoom-label');
  if (!controls || !label) throw new Error('the graph has no zoom label');
  const words = document.createRange();
  words.selectNodeContents(label);
  const text = words.getBoundingClientRect();
  const box = label.getBoundingClientRect();
  const style = getComputedStyle(label);
  return {
    text: label.textContent,
    controls: controls.getBoundingClientRect().width,
    left: text.left - box.left - parseFloat(style.borderLeftWidth),
    right: box.right - parseFloat(style.borderRightWidth) - text.right,
  };
};

export const mapBandProblems = ({ borderContrast }: { borderContrast: number }): string[] => {
  const TOLERANCE = 0.5;
  const READING_FLOOR = 0.92;
  const drawing = document.querySelector('#graph .drawing');
  const zoom = drawing === null ? 1 : Number(getComputedStyle(drawing).getPropertyValue('--zoom'));
  const shown = (element: Element): boolean =>
    element.getBoundingClientRect().width > 0 &&
    element.checkVisibility({ visibilityProperty: true });
  const inside = (inner: DOMRect, outer: DOMRect): boolean =>
    inner.left >= outer.left - TOLERANCE &&
    inner.right <= outer.right + TOLERANCE &&
    inner.top >= outer.top - TOLERANCE &&
    inner.bottom <= outer.bottom + TOLERANCE;
  const channelsOf = (colour: string): number[] =>
    (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const luminanceOf = (colour: string): number => {
    const [red = 0, green = 0, blue = 0] = channelsOf(colour).map((channel) => {
      const share = channel / 255;
      return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrastOf = (one: string, other: string): number => {
    const [dark, light] = [luminanceOf(one), luminanceOf(other)].sort((a, b) => a - b);
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
  };

  const problems: string[] = [];
  for (const box of document.querySelectorAll('#graph .box.level')) {
    const shape = box.querySelector(':scope > rect');
    if (shape === null || !shown(shape)) continue;
    const id = box.getAttribute('data-box') ?? '';
    const boxRect = shape.getBoundingClientRect();
    const style = getComputedStyle(shape);
    const stroke =
      parseFloat(style.strokeWidth) * (style.vectorEffect === 'non-scaling-stroke' ? 1 : zoom);
    if (stroke < 1 - 0.01) problems.push(`the border of ${id} is ${stroke.toFixed(2)} px`);
    const contrast = contrastOf(style.stroke, style.fill);
    if (contrast < borderContrast)
      problems.push(`the border of ${id} has a contrast of ${contrast.toFixed(2)}`);
    for (const chip of box.querySelectorAll('.chip > rect')) {
      if (!shown(chip)) continue;
      const mark = chip.parentElement?.getAttribute('data-mark') ?? '';
      const rect = chip.getBoundingClientRect();
      const floor = Number(chip.getAttribute('height')) * READING_FLOOR;
      if (rect.height < floor - TOLERANCE)
        problems.push(`the ${mark} chip of ${id} is ${rect.height.toFixed(1)} px high`);
      if (!inside(rect, boxRect)) problems.push(`the ${mark} chip runs past its box ${id}`);
    }
  }
  return problems.map((problem) => `zoom ${String(zoom)}: ${problem}`);
};

export interface CornerPlace {
  readonly under: boolean;
  readonly inGraph: boolean;
  readonly free: { readonly x: number; readonly y: number };
  readonly corner: { readonly x: number; readonly y: number };
}

export const cornerPlaceOf = (id: string): CornerPlace => {
  const graph = document.querySelector('#graph')?.getBoundingClientRect();
  const box = document.querySelector(`#graph [data-box="${id}"] > rect`)?.getBoundingClientRect();
  if (graph === undefined || box === undefined) throw new Error(`the graph shows no box ${id}`);
  const covers = [...document.querySelectorAll('#graph > .zoom-controls, #graph > .overview-map')]
    .map((element) => element.getBoundingClientRect())
    .filter(({ width }) => width > 0);
  const left = Math.min(...covers.map((rect) => rect.left));
  const top = Math.min(...covers.map((rect) => rect.top));
  const right = Math.max(...covers.map((rect) => rect.right));
  const bottom = Math.max(...covers.map((rect) => rect.bottom));
  return {
    under: box.left < right && left < box.right && box.top < bottom && top < box.bottom,
    inGraph:
      box.left >= graph.left &&
      box.top >= graph.top &&
      box.right <= graph.right &&
      box.bottom <= graph.bottom,
    free: { x: box.left + box.width / 4, y: box.top + box.height / 4 },
    corner: { x: left, y: top },
  };
};

export interface CornerLook {
  readonly graphBottom: number;
  readonly controls: DOMRect;
  readonly label: DOMRect;
  readonly toggle: DOMRect;
  readonly overviewMap: DOMRect;
  readonly hints: readonly DOMRect[];
}

export const cornerLookOf = (): CornerLook => {
  const rectOf = (selector: string): DOMRect => {
    const element = document.querySelector(selector);
    if (element === null) throw new Error(`the graph has no ${selector}`);
    return element.getBoundingClientRect();
  };
  return {
    graphBottom: rectOf('#graph').bottom,
    controls: rectOf('#graph > .zoom-controls'),
    label: rectOf('#graph .zoom-label'),
    toggle: rectOf('#graph .map-toggle'),
    overviewMap: rectOf('#graph > .overview-map'),
    hints: [...document.querySelectorAll('#graph .edge-hint')]
      .map((hint) => hint.getBoundingClientRect())
      .filter(({ width }) => width > 0),
  };
};
