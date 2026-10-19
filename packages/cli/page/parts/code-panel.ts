import { EDITORS, editorUrl } from '@callmap/editor-link';
import type { EditorView } from '@codemirror/view';
import { codeEditorOf } from '../code-editor.ts';
import { functionCodeOf, pageFunctionsOf } from '../functions.ts';
import type { PageFunction } from '../functions.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';
import { sidePanelOf } from '../side-panel.ts';

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

const codePanel: PagePart = (page) => {
  const functions = pageFunctionsOf(page.data);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Code');
  section.className = 'code-panel';
  const hint = document.createElement('p');
  hint.className = 'code-hint';
  hint.textContent = 'Click a box to read its code.';
  section.append(hint);
  const panel = sidePanelOf({
    side: 'right',
    label: 'Code panel',
    name: 'code panel',
    body: section,
    widthKey: 'callmap.code-panel.width',
    defaultWidth: 520,
    open: false,
    onChange: page.keepSelectionInView,
  });
  page.graph.after(panel.element);
  let editor: EditorView | undefined;
  let latest: PageFunction | undefined;

  const show = async (shown: PageFunction): Promise<void> => {
    latest = shown;
    const heading = document.createElement('h2');
    heading.textContent = shown.name;
    editor?.destroy();
    editor = undefined;
    section.replaceChildren(heading, placeOf(page, shown));
    section.setAttribute('aria-busy', 'true');
    panel.open();
    const sources = await page.sources;
    if (latest !== shown) return;
    editor = codeEditorOf(shown.file, functionCodeOf(page.data, sources, shown));
    section.append(editor.dom);
    section.setAttribute('aria-busy', 'false');
  };

  page.onBoxClick(({ id }) => {
    const shown = functions.get(id);
    if (shown !== undefined) void show(shown);
  });
};

export default codePanel;
