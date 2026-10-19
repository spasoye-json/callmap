import { EDITORS, editorUrl } from '@callmap/editor-link';
import type { EditorView } from '@codemirror/view';
import { codeEditorOf } from '../code-editor.ts';
import { functionCodeOf, pageFunctionsOf } from '../functions.ts';
import type { PageFunction } from '../functions.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';

const WIDTH_KEY = 'callmap.code-panel.width';
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 280;
const KEY_STEP = 40;
const SMALLEST_GRAPH = 240;

const storedWidth = (): number | undefined => {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
};

const storeWidth = (width: number): void => {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    return;
  }
};

const editorLinkOf = ({ data }: ReaderPage, { file, firstLine }: PageFunction): HTMLElement => {
  const link = document.createElement('a');
  link.className = 'editor-link';
  link.href = editorUrl(data.editor.repoRoot, { file, line: firstLine }, data.editor.name);
  link.textContent = `Open in ${EDITORS[data.editor.name].label}`;
  return link;
};

const placeOf = (page: ReaderPage, shown: PageFunction): HTMLElement => {
  const place = document.createElement('p');
  place.className = 'code-place';
  const where = `${shown.file}:${String(shown.firstLine)}`;
  place.textContent = shown.mark === undefined ? where : `${where}, ${shown.mark}`;
  if (shown.mark !== 'removed') place.append(' ', editorLinkOf(page, shown));
  return place;
};

const edgeOf = (section: HTMLElement): HTMLElement => {
  const edge = document.createElement('div');
  edge.className = 'code-edge';
  edge.tabIndex = 0;
  edge.setAttribute('role', 'separator');
  edge.setAttribute('aria-orientation', 'vertical');
  edge.setAttribute('aria-label', 'Width of the code panel');
  edge.setAttribute('aria-valuemin', String(MIN_WIDTH));

  const largest = (): number => Math.max(MIN_WIDTH, window.innerWidth - SMALLEST_GRAPH);
  const resize = (width: number, keep: boolean): void => {
    const next = Math.round(Math.min(largest(), Math.max(MIN_WIDTH, width)));
    section.style.width = `${String(next)}px`;
    edge.setAttribute('aria-valuenow', String(next));
    edge.setAttribute('aria-valuemax', String(largest()));
    if (keep) storeWidth(next);
  };
  const width = (): number => Number(edge.getAttribute('aria-valuenow'));
  resize(storedWidth() ?? DEFAULT_WIDTH, false);

  let drag: { readonly x: number; readonly width: number } | undefined;
  edge.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drag = { x: event.clientX, width: width() };
    if ('setPointerCapture' in edge) edge.setPointerCapture(event.pointerId);
    section.classList.add('resizing');
  });
  edge.addEventListener('pointermove', (event) => {
    if (drag !== undefined) resize(drag.width + drag.x - event.clientX, false);
  });
  const endDrag = (): void => {
    if (drag === undefined) return;
    drag = undefined;
    section.classList.remove('resizing');
    storeWidth(width());
  };
  edge.addEventListener('pointerup', endDrag);
  edge.addEventListener('pointercancel', endDrag);
  edge.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: KEY_STEP, ArrowRight: -KEY_STEP }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    resize(width() + step, true);
  });
  return edge;
};

const collapseButtonOf = (collapse: () => void): HTMLElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-collapse';
  button.setAttribute('aria-label', 'Collapse the code panel');
  button.title = 'Collapse the code panel';
  button.textContent = '×';
  button.addEventListener('click', collapse);
  return button;
};

const codePanel: PagePart = (page) => {
  const functions = pageFunctionsOf(page.data);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Code');
  section.className = 'code-panel';
  section.hidden = true;
  const header = document.createElement('header');
  header.className = 'code-header';
  const body = document.createElement('div');
  body.className = 'code-body';
  body.append(header);
  section.append(edgeOf(section), body);
  page.graph.after(section);
  let editor: EditorView | undefined;

  const collapse = (): void => {
    section.hidden = true;
  };

  const show = (shown: PageFunction): void => {
    const heading = document.createElement('h2');
    heading.textContent = shown.name;
    header.replaceChildren(heading, collapseButtonOf(collapse));
    editor?.destroy();
    editor = codeEditorOf(shown.file, functionCodeOf(page.data, shown));
    body.replaceChildren(header, placeOf(page, shown), editor.dom);
    section.hidden = false;
    page.keepInView(shown.id);
  };

  page.onBoxClick(({ id }) => {
    const shown = functions.get(id);
    if (shown !== undefined) show(shown);
  });
};

export default codePanel;
