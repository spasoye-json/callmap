import { coverGraph, emptyStateOf } from '../empty-state.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';
import { diffView } from '../views/diff.ts';
import { wholeProjectView } from '../views/whole-project.ts';

const noChange: PagePart = (page) => {
  if (page.data.review.functions.length > 0) return;
  const { state: message } = emptyStateOf({
    name: 'no-change',
    title: 'No changed functions',
    line: 'The branch changes no function against its base.',
    action: 'Open Whole project',
    act: () => {
      void page.showView(wholeProjectView.name);
    },
    icon: [
      svgOf('rect', { x: 3, y: 10, width: 8, height: 8, rx: 2 }),
      svgOf('rect', { x: 17, y: 10, width: 8, height: 8, rx: 2 }),
      svgOf('path', { d: 'M11 14h6' }),
    ],
  });
  page.graph.before(message);

  coverGraph(page.graph, message, page.currentView() === diffView);
  page.onViewChange((view) => {
    coverGraph(page.graph, message, view === diffView);
  });
};

export default noChange;
