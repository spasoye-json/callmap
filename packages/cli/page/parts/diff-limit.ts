import { coverGraph, emptyStateOf } from '../empty-state.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';
import type { OverLimit } from '../view.ts';
import { wholeProjectView } from '../views/whole-project.ts';
import { callsWordsOf, functionsAndCallsOf } from '../words.ts';

const lineOf = (over: OverLimit): string =>
  `This review holds ${functionsAndCallsOf(over)}. The Diff view draws up to ${callsWordsOf(over.limit)}, so it draws none of them. Open the Whole project view to read the changes level by level.`;

const diffLimit: PagePart = (page) => {
  const { state: message, text } = emptyStateOf({
    name: 'diff-limit',
    title: 'Over the Diff limit',
    line: '',
    action: 'Open Whole project',
    act: () => {
      void page.showView(wholeProjectView.name);
    },
    icon: [
      svgOf('rect', { x: 3, y: 3, width: 22, height: 22, rx: 3 }),
      svgOf('path', { d: 'M9 14h10' }),
    ],
  });
  message.hidden = true;
  page.graph.before(message);

  page.onOverLimitChange((over) => {
    if (over !== undefined) text.textContent = lineOf(over);
    coverGraph(page.graph, message, over !== undefined);
  });
};

export default diffLimit;
