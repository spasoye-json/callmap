import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import { byText } from '@callmap/review';
import { pageFunctionsOf } from '../functions.ts';
import { moreButtonOf, sectionHeadOf, spanOf } from '../panel-elements.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';
import { byLine } from '../scene.ts';
import { svgOf } from '../svg.ts';
import { countWordsOf } from '../words.ts';

const FILES_SHOWN = 5;
const OPEN_CHEVRON = 'M4 6l4 4 4-4';
const CLOSED_CHEVRON = 'M6 4l4 4-4 4';

interface FileOpenEnds {
  readonly file: string;
  readonly openEnds: readonly OpenEnd[];
}

const filesOf = (page: ReaderPage): readonly FileOpenEnds[] => {
  const functions = pageFunctionsOf(page.data);
  const fileOf = (caller: FunctionId): string =>
    functions.get(caller)?.file ?? caller.split('#')[0] ?? caller;
  const byFile = new Map<string, OpenEnd[]>();
  for (const openEnd of page.data.review.openEnds) {
    const file = fileOf(openEnd.caller);
    byFile.set(file, [...(byFile.get(file) ?? []), openEnd]);
  }
  return [...byFile]
    .map(([file, openEnds]) => ({
      file,
      openEnds: [...openEnds].sort(byLine),
    }))
    .sort(
      (left, right) =>
        right.openEnds.length - left.openEnds.length || byText(left.file, right.file),
    );
};

const openEndRowOf = (page: ReaderPage, { caller, line, expression }: OpenEnd): HTMLElement => {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'open-end';
  const code = document.createElement('span');
  code.className = 'expression';
  code.textContent = expression;
  const where = document.createElement('span');
  where.className = 'where';
  where.textContent = `line ${String(line)}`;
  row.append(code, ' ', where);
  row.addEventListener('click', () => {
    void page.open(caller);
  });
  return row;
};

const fileGroupOf = (page: ReaderPage, { file, openEnds }: FileOpenEnds, open: boolean) => {
  const group = document.createElement('div');
  group.className = 'open-end-file';
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'file-head';
  const chevron = svgOf('path');
  const icon = svgOf(
    'svg',
    { class: 'chevron', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    chevron,
  );
  const path = document.createElement('span');
  path.className = 'path';
  path.textContent = file;
  path.title = file;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = String(openEnds.length);
  head.append(icon, path, ' ', count);
  const rows = document.createElement('div');
  rows.className = 'open-end-rows';
  rows.append(...openEnds.map((openEnd) => openEndRowOf(page, openEnd)));
  const show = (expanded: boolean): void => {
    head.setAttribute('aria-expanded', String(expanded));
    chevron.setAttribute('d', expanded ? OPEN_CHEVRON : CLOSED_CHEVRON);
    rows.hidden = !expanded;
  };
  head.addEventListener('click', () => {
    show(head.getAttribute('aria-expanded') !== 'true');
  });
  show(open);
  group.append(head, rows);
  return group;
};

const openEnds: PagePart = (page) => {
  const files = filesOf(page);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Open ends');
  section.className = 'open-ends';
  const head = sectionHeadOf(
    'Open ends',
    spanOf('total', page.data.review.openEnds.length.toLocaleString('en-US')),
  );
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Calls the checker could not resolve, by file';
  section.append(head, hint);

  const groups = files.map((file, index) => fileGroupOf(page, file, index === 0));
  section.append(...groups.slice(0, FILES_SHOWN));
  const rest = groups.slice(FILES_SHOWN);
  if (rest.length > 0) {
    section.append(
      moreButtonOf(
        'more',
        `Show ${countWordsOf(rest.length, 'more file', 'more files')}`,
        (more) => {
          more.replaceWith(...rest);
        },
      ),
    );
  }
  page.panels.append(section);
};

export default openEnds;
