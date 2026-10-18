import { editorUrl } from '@archmap/editor-link';
import type { Editor } from '@archmap/editor-link';
import type { MarkedFunction } from '@archmap/review';
import { markedFunctionsOf, sourceLinesOf } from '../functions.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';

const lineOf = (number: number, text: string, changed: boolean): HTMLElement => {
  const line = document.createElement(changed ? 'ins' : 'span');
  line.className = 'line';
  const gutter = document.createElement('span');
  gutter.className = 'line-number';
  gutter.textContent = String(number);
  const code = document.createElement('span');
  code.className = 'line-text';
  code.textContent = text;
  line.append(gutter, code);
  return line;
};

const codeOf = (page: ReaderPage, shown: MarkedFunction): HTMLElement => {
  const changed = new Set(page.data.changedLines[shown.id] ?? []);
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.append(
    ...sourceLinesOf(page.data, shown).map((text, index) => {
      const number = shown.firstLine + index;
      return lineOf(number, text, changed.has(number));
    }),
  );
  pre.append(code);
  return pre;
};

const EDITOR_NAMES: Readonly<Record<Editor, string>> = {
  vscode: 'VS Code',
  jetbrains: 'JetBrains',
};

const editorLinkOf = ({ data }: ReaderPage, { file, firstLine }: MarkedFunction): HTMLElement => {
  const link = document.createElement('a');
  link.className = 'editor-link';
  link.href = editorUrl(data.editor.repoRoot, { file, line: firstLine }, data.editor.name);
  link.textContent = `Open in ${EDITOR_NAMES[data.editor.name]}`;
  return link;
};

const show = (section: HTMLElement, page: ReaderPage, shown: MarkedFunction): void => {
  const heading = document.createElement('h2');
  heading.textContent = shown.name;
  const place = document.createElement('p');
  place.className = 'code-place';
  place.textContent = `${shown.file}:${String(shown.firstLine)}, ${shown.mark}`;
  if (shown.mark !== 'removed') place.append(' ', editorLinkOf(page, shown));
  section.replaceChildren(heading, place, codeOf(page, shown));
};

const codePanel: PagePart = (page) => {
  const functions = markedFunctionsOf(page.data);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Code');
  section.className = 'code-panel';
  const hint = document.createElement('p');
  hint.className = 'code-hint';
  hint.textContent = 'Click a box to read its code.';
  section.append(hint);
  page.panels.append(section);

  page.graph.on('tap', 'node.function', (event) => {
    const shown = functions.get((event.target as { id: () => string }).id());
    if (shown !== undefined) show(section, page, shown);
  });
};

export default codePanel;
