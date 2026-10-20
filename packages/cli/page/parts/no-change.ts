import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';
import { diffView } from '../views/diff.ts';
import { wholeProjectView } from '../views/whole-project.ts';

const TITLE_ID = 'no-change-title';

const iconOf = (): SVGSVGElement =>
  svgOf(
    'svg',
    { class: 'no-change-icon', width: 28, height: 28, viewBox: '0 0 28 28', 'aria-hidden': 'true' },
    svgOf('rect', { x: 3, y: 10, width: 8, height: 8, rx: 2 }),
    svgOf('rect', { x: 17, y: 10, width: 8, height: 8, rx: 2 }),
    svgOf('path', { d: 'M11 14h6' }),
  );

const noChange: PagePart = (page) => {
  if (page.data.review.functions.length > 0) return;
  const message = document.createElement('section');
  message.className = 'no-change';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-labelledby', TITLE_ID);
  const title = document.createElement('h2');
  title.id = TITLE_ID;
  title.textContent = 'No changed functions';
  const line = document.createElement('p');
  line.textContent = 'The branch changes no function against its base.';
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open Whole project';
  open.addEventListener('click', () => {
    void page.showView(wholeProjectView.name);
  });
  message.append(iconOf(), title, line, open);
  page.graph.before(message);

  const show = (empty: boolean): void => {
    message.hidden = !empty;
    page.graph.hidden = empty;
  };
  show(page.currentView() === diffView);
  page.onViewChange((view) => {
    show(view === diffView);
  });
};

export default noChange;
