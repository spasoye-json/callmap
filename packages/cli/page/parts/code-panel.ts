import { EDITORS, editorUrl } from '@callmap/editor-link';
import type { EditorView } from '@codemirror/view';
import { callListsOf } from '../call-lists.ts';
import { chipOf } from '../chips.ts';
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
  place.textContent = `${shown.file}:${String(shown.firstLine)}`;
  if (shown.mark !== 'removed') place.append(' ', editorLinkOf(page, shown));
  return place;
};

const headOf = (shown: PageFunction): HTMLElement => {
  const head = document.createElement('div');
  head.className = 'code-head';
  if (shown.mark !== undefined) {
    const chip = chipOf(shown.mark);
    chip.removeAttribute('aria-hidden');
    chip.setAttribute('role', 'img');
    chip.setAttribute('aria-label', shown.mark);
    head.append(chip);
  }
  const heading = document.createElement('h2');
  heading.textContent = shown.name;
  head.append(heading);
  return head;
};

const codePanel: PagePart = (page) => {
  const functions = pageFunctionsOf(page.data);
  const listsOf = callListsOf(page.data);
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
    defaultWidth: 392,
    open: false,
    onChange: page.keepSelectionInView,
  });
  page.graph.after(panel.element);
  let editor: EditorView | undefined;
  let latest: PageFunction | undefined;

  const show = async (shown: PageFunction): Promise<void> => {
    latest = shown;
    editor?.destroy();
    editor = undefined;
    const lists = listsOf(shown.id, (id) => {
      void page.open(id);
    });
    section.replaceChildren(headOf(shown), placeOf(page, shown), lists);
    section.setAttribute('aria-busy', 'true');
    panel.open();
    const sources = await page.sources;
    if (latest !== shown) return;
    editor = codeEditorOf(shown.file, functionCodeOf(page.data, sources, shown));
    lists.before(editor.dom);
    section.setAttribute('aria-busy', 'false');
  };

  page.onBoxClick(({ id }) => {
    const shown = functions.get(id);
    if (shown !== undefined) void show(shown);
  });
};

export default codePanel;
