import { markedFunctionsOf } from '../functions.ts';
import type { PagePart } from '../reader-page.ts';
import { routeEntryPointsOf, routeView } from '../views/route.ts';

const entryPoints: PagePart = (page) => {
  const functions = markedFunctionsOf(page.data);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Entry points');
  section.className = 'entry-points';
  section.hidden = true;
  const heading = document.createElement('h2');
  heading.textContent = 'Entry points';
  const list = document.createElement('ul');
  section.append(heading, list);
  page.panels.append(section);

  const buttons = routeEntryPointsOf(page.data).map(({ id, reachesChange }) => {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.className = 'entry-name';
    name.textContent = functions.get(id)?.name ?? id;
    const file = document.createElement('span');
    file.className = 'entry-file';
    file.textContent = functions.get(id)?.file ?? '';
    button.append(name, ' ', file);
    if (reachesChange) {
      const change = document.createElement('span');
      change.className = 'entry-change';
      change.textContent = 'reaches a change';
      button.append(' ', change);
    }
    button.addEventListener('click', () => {
      for (const other of buttons) other.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'true');
      void page.pick(id);
    });
    const item = document.createElement('li');
    item.append(button);
    list.append(item);
    return button;
  });
  buttons[0]?.setAttribute('aria-current', 'true');

  page.onViewChange((view) => {
    section.hidden = view !== routeView;
  });
};

export default entryPoints;
