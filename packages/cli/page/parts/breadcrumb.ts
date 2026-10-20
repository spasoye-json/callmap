import { levelsOf } from '../levels.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';
import { wholeProjectView } from '../views/whole-project.ts';

const countOf = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

const upArrowOf = (): SVGSVGElement =>
  svgOf(
    'svg',
    { class: 'up-arrow', width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    svgOf('path', { d: 'M8 13V3M4 7l4-4 4 4' }),
  );

const breadcrumb: PagePart = (page) => {
  const levels = levelsOf(page.data);
  const bar = document.createElement('section');
  bar.setAttribute('aria-label', 'Level summary');
  bar.className = 'crumb-bar';
  bar.setAttribute('data-covers', 'top');
  bar.hidden = true;
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Level');
  nav.className = 'breadcrumb';
  const list = document.createElement('ol');
  nav.append(list);
  const summary = document.createElement('span');
  summary.className = 'level-counts';
  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'up-level';
  up.append(upArrowOf(), 'Up one level');
  bar.append(nav, summary, up);
  page.graph.append(bar);

  let parent: string | undefined;
  up.addEventListener('click', () => {
    if (parent !== undefined) void page.choose({ kind: 'level', path: parent });
  });

  const show = (level: string): void => {
    const crumbs = levels.crumbsOf(level);
    list.replaceChildren(
      ...crumbs.map(({ path, label }, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (index === crumbs.length - 1) button.setAttribute('aria-current', 'location');
        button.addEventListener('click', () => {
          void page.choose({ kind: 'level', path });
        });
        const item = document.createElement('li');
        item.append(button);
        return item;
      }),
    );
    const { boxes, lines } = levels.sceneOf(level);
    summary.textContent = `${countOf(boxes.length, 'box', 'boxes')} · ${countOf(lines.length, 'line', 'lines')}`;
    parent = crumbs.at(-2)?.path;
    up.disabled = parent === undefined;
  };

  show(levels.top);
  page.onViewChange((view) => {
    bar.hidden = view !== wholeProjectView;
  });
  page.onChoiceChange((view, choice) => {
    if (view === wholeProjectView && choice.kind === 'level') show(choice.path);
  });
};

export default breadcrumb;
