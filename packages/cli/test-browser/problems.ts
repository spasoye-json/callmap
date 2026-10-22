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
