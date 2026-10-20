import { byText } from '@callmap/review';
import { pageFunctionsOf } from '../functions.ts';
import type { PageFunction } from '../functions.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const MAX_RESULTS = 30;

const matchesOf = (candidates: readonly PageFunction[], text: string): readonly PageFunction[] => {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') return [];
  return candidates.filter(({ name }) => name.toLowerCase().includes(wanted)).slice(0, MAX_RESULTS);
};

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const resultOf = (found: PageFunction, open: (found: PageFunction) => void): HTMLElement => {
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

const search: PagePart = (page) => {
  const candidates = [...pageFunctionsOf(page.data).values()].sort(
    (left, right) => byText(left.name, right.name) || byText(left.file, right.file),
  );
  const open = ({ id }: PageFunction): void => {
    void page.open(id);
  };

  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Search');
  section.className = 'search';
  const form = document.createElement('form');
  form.setAttribute('role', 'search');
  const label = document.createElement('label');
  label.className = 'search-field';
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'Find a function';
  input.setAttribute('aria-label', 'Find a function');
  const key = document.createElement('kbd');
  key.textContent = '/';
  key.title = 'Press / to find a function';
  label.append(
    svgOf(
      'svg',
      { class: 'search-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      svgOf('circle', { cx: 7, cy: 7, r: 4.5 }),
      svgOf('path', { d: 'M10.5 10.5L14 14' }),
    ),
    input,
    key,
  );
  const results = document.createElement('ul');
  results.className = 'results';
  form.append(label);
  section.append(form, results);
  page.panels.append(section);

  const matches = (): readonly PageFunction[] => matchesOf(candidates, input.value);
  input.addEventListener('input', () => {
    results.replaceChildren(...matches().map((found) => resultOf(found, open)));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || isTextField(event.target)) return;
    event.preventDefault();
    input.focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const [first] = matches();
    if (first !== undefined) open(first);
  });
};

export default search;
