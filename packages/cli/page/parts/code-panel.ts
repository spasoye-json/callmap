import { editorUrl } from '@archmap/editor-link';
import type { Editor } from '@archmap/editor-link';
import type { MarkedFunction } from '@archmap/review';
import { markedFunctionsOf, sourceLinesOf } from '../functions.ts';
import { targetIdOf } from '../reader-page.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';

type LineMark = 'changed' | 'removed-above' | 'kept';

const REMOVED_ABOVE = 'The branch removed lines above this line.';

const lineOf = (number: number, text: string, mark: LineMark): HTMLElement => {
  const line = document.createElement(mark === 'changed' ? 'ins' : 'span');
  line.className = mark === 'removed-above' ? 'line removed-above' : 'line';
  if (mark === 'removed-above') line.title = REMOVED_ABOVE;
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
  const lines = page.data.review.changedLines[shown.id];
  const changed = new Set(lines?.changed);
  const removedAbove = new Set(lines?.removedAbove);
  const markOf = (number: number): LineMark =>
    changed.has(number) ? 'changed' : removedAbove.has(number) ? 'removed-above' : 'kept';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.append(
    ...sourceLinesOf(page.data, shown).map((text, index) => {
      const number = shown.firstLine + index;
      return lineOf(number, text, markOf(number));
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
    const shown = functions.get(targetIdOf(event));
    if (shown !== undefined) show(section, page, shown);
  });
};

export default codePanel;
