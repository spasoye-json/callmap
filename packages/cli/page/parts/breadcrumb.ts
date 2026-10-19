import { levelsOf } from '../levels.ts';
import type { PagePart } from '../reader-page.ts';
import { wholeProjectView } from '../views/whole-project.ts';

const breadcrumb: PagePart = (page) => {
  const levels = levelsOf(page.data);
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Level');
  nav.className = 'breadcrumb';
  nav.hidden = true;
  const list = document.createElement('ol');
  nav.append(list);
  page.graph.append(nav);

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
  };

  show(levels.top);
  page.onViewChange((view) => {
    nav.hidden = view !== wholeProjectView;
  });
  page.onChoiceChange((view, choice) => {
    if (view === wholeProjectView && choice.kind === 'level') show(choice.path);
  });
};

export default breadcrumb;
