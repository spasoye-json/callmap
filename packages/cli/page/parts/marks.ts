import type { FunctionMark } from '@callmap/review';
import type { PagePart } from '../reader-page.ts';

const MARKS: readonly FunctionMark[] = ['added', 'removed', 'changed', 'neighbour'];

const marks: PagePart = ({ data, panels }) => {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Marks');
  section.className = 'marks';
  const list = document.createElement('ul');
  for (const mark of MARKS) {
    const item = document.createElement('li');
    item.className = `mark ${mark}`;
    const count = data.review.functions.filter((marked) => marked.mark === mark).length;
    item.textContent = `${count} ${mark}`;
    list.append(item);
  }
  section.append(list);
  panels.append(section);
};

export default marks;
