import { choiceListOf } from '../choice-list.ts';
import { pageFunctionsOf } from '../functions.ts';
import type { PagePart } from '../reader-page.ts';
import type { Choice } from '../view.ts';
import { routeEntryPointsOf, routeView } from '../views/route.ts';

const entryPoints: PagePart = (page) => {
  const functions = pageFunctionsOf(page.data);
  const entries = routeEntryPointsOf(page.data);
  const treeFrom = (id: string): Choice => ({ kind: 'tree', from: id });

  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Entry points');
  section.className = 'entry-points';
  const heading = document.createElement('h2');
  heading.textContent = 'Entry points';
  const list = document.createElement('ul');
  section.append(heading, list);
  page.panels.append(section);

  const choices = choiceListOf(
    page,
    routeView,
    section,
    entries[0] === undefined ? undefined : treeFrom(entries[0].id),
  );
  for (const { id, reachesChange } of entries) {
    const name = document.createElement('span');
    name.className = 'entry-name';
    name.textContent = functions.get(id)?.name ?? id;
    const file = document.createElement('span');
    file.className = 'entry-file';
    file.textContent = functions.get(id)?.file ?? '';
    const button = choices.buttonOf(treeFrom(id), name, ' ', file);
    if (reachesChange) {
      const change = document.createElement('span');
      change.className = 'entry-change';
      change.textContent = 'reaches a change';
      button.append(' ', change);
    }
    const item = document.createElement('li');
    item.append(button);
    list.append(item);
  }
};

export default entryPoints;
