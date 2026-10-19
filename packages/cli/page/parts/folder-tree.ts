import { folderOf, nameOf } from '../nested-scene.ts';
import type { PagePart } from '../reader-page.ts';
import { folderView, foldersOf } from '../views/folder.ts';

const folderTree: PagePart = (page) => {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Folders');
  nav.className = 'folder-tree';
  nav.hidden = true;
  const heading = document.createElement('h2');
  heading.textContent = 'Folders';
  const hint = document.createElement('p');
  hint.className = 'folder-hint';
  hint.textContent = 'Pick a folder to draw its functions.';
  const root = document.createElement('ul');
  nav.append(heading, hint, root);
  page.panels.prepend(nav);

  const buttons: HTMLButtonElement[] = [];
  const items = new Map<string, HTMLLIElement>();
  const listIn = (parent: string | undefined): HTMLUListElement => {
    const item = parent === undefined ? undefined : items.get(parent);
    if (item === undefined) return root;
    return item.querySelector('ul') ?? item.appendChild(document.createElement('ul'));
  };
  for (const folder of foldersOf(page.data)) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${nameOf(folder)}/`;
    button.setAttribute('aria-label', `${folder}/`);
    button.addEventListener('click', () => {
      for (const other of buttons) other.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'true');
      hint.hidden = true;
      void page.pick(folder);
    });
    buttons.push(button);
    item.append(button);
    items.set(folder, item);
    listIn(folderOf(folder)).append(item);
  }

  page.onViewChange((view) => {
    nav.hidden = view !== folderView;
  });
};

export default folderTree;
