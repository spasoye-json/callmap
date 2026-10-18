import { byText } from '@archmap/review';
import type { MarkedFunction } from '@archmap/review';
import { markedFunctionsOf } from '../functions.ts';
import { hopOpenerOf } from '../hops.ts';
import type { PagePart, ReaderPage } from '../reader-page.ts';

const MAX_RESULTS = 30;

const matchesOf = (
  candidates: readonly MarkedFunction[],
  text: string,
): readonly MarkedFunction[] => {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') return [];
  return candidates.filter(({ name }) => name.toLowerCase().includes(wanted)).slice(0, MAX_RESULTS);
};

const resultOf = (found: MarkedFunction, open: (found: MarkedFunction) => void): HTMLElement => {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  const name = document.createElement('span');
  name.className = 'result-name';
  name.textContent = found.name;
  const file = document.createElement('span');
  file.className = 'result-file';
  file.textContent = found.file;
  button.append(name, ' ', file);
  button.addEventListener('click', () => {
    open(found);
  });
  item.append(button);
  return item;
};

const openerOf = (page: ReaderPage): ((found: MarkedFunction) => void) => {
  const { show } = hopOpenerOf(page);
  return ({ id }) => {
    show([id]);
    const box = page.graph.getElementById(id);
    page.graph.elements(':selected').unselect();
    box.select();
    box.emit('tap');
    page.graph.center(box);
  };
};

const search: PagePart = (page) => {
  const candidates = [...markedFunctionsOf(page.data).values()].sort(
    (left, right) => byText(left.name, right.name) || byText(left.file, right.file),
  );
  const open = openerOf(page);

  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Search');
  section.className = 'search';
  const form = document.createElement('form');
  form.setAttribute('role', 'search');
  const label = document.createElement('label');
  label.textContent = 'Find a function';
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  label.append(input);
  const results = document.createElement('ul');
  results.className = 'results';
  form.append(label);
  section.append(form, results);
  page.panels.append(section);

  const matches = (): readonly MarkedFunction[] => matchesOf(candidates, input.value);
  input.addEventListener('input', () => {
    results.replaceChildren(...matches().map((found) => resultOf(found, open)));
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const [first] = matches();
    if (first !== undefined) open(first);
  });
};

export default search;
