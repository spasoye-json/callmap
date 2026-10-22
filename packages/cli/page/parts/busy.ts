import { pageFunctionsOf } from '../functions.ts';
import { levelsOf } from '../levels.ts';
import type { PagePart } from '../reader-page.ts';
import type { Choice } from '../view.ts';

const BUSY_DELAY = 150;

const busy: PagePart = (page) => {
  const levels = levelsOf(page.data);
  const functions = pageFunctionsOf(page.data);
  const labelOf = (choice: Choice): string => {
    switch (choice.kind) {
      case 'level':
        return levels.crumbsOf(choice.path).at(-1)?.label ?? choice.path;
      case 'folder':
        return `${choice.folder}/`;
      case 'tree':
        return functions.get(choice.from)?.name ?? choice.from;
    }
  };

  const state = document.createElement('div');
  state.setAttribute('role', 'status');
  state.className = 'busy';
  state.hidden = true;
  const progress = document.createElement('div');
  progress.className = 'busy-progress';
  const text = document.createElement('p');
  text.className = 'busy-text';
  const name = document.createElement('code');
  state.append(progress, text);
  page.graph.append(state);

  let nameInLayout = page.currentView().name;
  page.onViewChange((view) => {
    nameInLayout = view.name;
  });
  page.onChoiceChange((_view, choice) => {
    nameInLayout = labelOf(choice);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (): void => {
    name.textContent = nameInLayout;
    text.replaceChildren('Laying out ', name, ' …');
    state.setAttribute('aria-label', `Laying out ${nameInLayout}`);
    progress.style.top = `${String(page.camera.view().coveredTop)}px`;
    state.hidden = false;
  };
  const update = (): void => {
    if (page.graph.getAttribute('aria-busy') === 'true') {
      timer ??= setTimeout(show, BUSY_DELAY);
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    state.hidden = true;
  };
  new MutationObserver(update).observe(page.graph, {
    attributes: true,
    attributeFilter: ['aria-busy'],
  });
  update();
};

export default busy;
