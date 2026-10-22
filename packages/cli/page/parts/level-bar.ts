import { arrowIconOf } from '../arrows.ts';
import { coverTopOfGraph } from '../camera.ts';
import { levelsOf } from '../levels.ts';
import type { PagePart } from '../reader-page.ts';
import { wholeProjectView } from '../views/whole-project.ts';
import { countWordsOf } from '../words.ts';

const levelBar: PagePart = (page) => {
  const levels = levelsOf(page.data);
  const bar = document.createElement('section');
  bar.setAttribute('aria-label', 'Level bar');
  bar.className = 'level-bar';
  coverTopOfGraph(bar);
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
  up.append(arrowIconOf('up', 'up-arrow'), 'Up one level');
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
    summary.textContent = `${countWordsOf(boxes.length, 'box', 'boxes')} · ${countWordsOf(lines.length, 'line', 'lines')}`;
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

export default levelBar;
