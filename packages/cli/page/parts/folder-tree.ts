import { choiceListOf } from '../choice-list.ts';
import { folderOf, nameOf } from '../nested-scene.ts';
import type { PagePart } from '../reader-page.ts';
import { folderView, foldersOf } from '../views/folder.ts';

const folderTree: PagePart = (page) => {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Folders');
  nav.className = 'folder-tree';
  const heading = document.createElement('h2');
  heading.textContent = 'Folders';
  const hint = document.createElement('p');
  hint.className = 'folder-hint';
  hint.textContent = 'Pick a folder to draw its functions.';
  const topList = document.createElement('ul');
  nav.append(heading, hint, topList);
  page.panels.prepend(nav);

  const choices = choiceListOf(page, folderView, nav);
  page.onChoiceChange((view) => {
    if (view === folderView) hint.hidden = true;
  });

  const items = new Map<string, HTMLLIElement>();
  const listIn = (parent: string | undefined): HTMLUListElement => {
    const item = parent === undefined ? undefined : items.get(parent);
    if (item === undefined) return topList;
    return item.querySelector('ul') ?? item.appendChild(document.createElement('ul'));
  };
  for (const folder of foldersOf(page.data)) {
    const button = choices.buttonOf({ kind: 'folder', folder }, `${nameOf(folder)}/`);
    button.setAttribute('aria-label', `${folder}/`);
    const item = document.createElement('li');
    item.append(button);
    items.set(folder, item);
    listIn(folderOf(folder)).append(item);
  }
};

export default folderTree;
