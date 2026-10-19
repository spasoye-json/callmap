import { byText } from '@archmap/review';
import { markedFunctionsOf } from '../functions.ts';
import type { PagePart } from '../reader-page.ts';
import type { SceneLine } from '../scene.ts';

const bundledCalls: PagePart = (page) => {
  const functions = markedFunctionsOf(page.data);
  const nameOf = (id: string): string => functions.get(id)?.name ?? id;
  const textOf = ({ from, to, oneOf }: SceneLine): string =>
    `${nameOf(from)} calls ${nameOf(to)}${oneOf === undefined ? '' : `, ${oneOf}`}`;

  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Calls');
  section.className = 'bundled-calls';
  section.hidden = true;
  page.panels.append(section);

  const itemOf = (call: SceneLine): HTMLElement => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = textOf(call);
    button.addEventListener('click', () => {
      void page.open(call.from);
    });
    item.append(button);
    return item;
  };

  page.onLineClick((line) => {
    if (line.calls === undefined) return;
    const heading = document.createElement('h2');
    heading.textContent = line.title ?? '';
    const list = document.createElement('ul');
    list.append(
      ...[...line.calls].sort((left, right) => byText(textOf(left), textOf(right))).map(itemOf),
    );
    section.replaceChildren(heading, list);
    section.hidden = false;
  });
  page.onViewChange(() => {
    section.hidden = true;
    section.replaceChildren();
  });
};

export default bundledCalls;
