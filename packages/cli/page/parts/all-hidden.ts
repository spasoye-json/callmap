import { hiddenIdsOf } from '../hidden-parts.ts';
import type { Laid } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const TITLE_ID = 'all-hidden-title';

const iconOf = (): SVGSVGElement =>
  svgOf(
    'svg',
    { class: 'no-change-icon', width: 28, height: 28, viewBox: '0 0 28 28', 'aria-hidden': 'true' },
    svgOf('rect', { x: 6, y: 9, width: 16, height: 10, rx: 2, 'stroke-dasharray': '3 3' }),
  );

const allHidden: PagePart = ({ graph, camera, hiddenMarks, toggleMark, onHiddenMarksChange }) => {
  const message = document.createElement('section');
  message.className = 'all-hidden';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-labelledby', TITLE_ID);
  message.hidden = true;
  const title = document.createElement('h2');
  title.id = TITLE_ID;
  title.textContent = 'All marks are hidden';
  const line = document.createElement('p');
  line.textContent = 'The legend hides every box of this view.';
  const showAll = document.createElement('button');
  showAll.type = 'button';
  showAll.textContent = 'Show all marks';
  showAll.addEventListener('click', () => {
    for (const mark of [...hiddenMarks()]) toggleMark(mark);
  });
  message.append(iconOf(), title, line, showAll);
  graph.append(message);

  const show = (level: Laid): void => {
    const hidden = hiddenIdsOf(level, hiddenMarks());
    message.hidden = level.boxes.length === 0 || !level.boxes.every(({ id }) => hidden.has(id));
  };
  camera.onChange(({ level }) => {
    show(level);
  });
  onHiddenMarksChange(() => {
    show(camera.view().level);
  });
};

export default allHidden;
