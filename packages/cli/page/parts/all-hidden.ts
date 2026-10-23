import { emptyStateOf } from '../empty-state.ts';
import { hiddenIdsOf } from '../hidden-parts.ts';
import type { Laid } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const allHidden: PagePart = ({
  graph,
  level: levelOf,
  onLevelChange,
  hiddenMarks,
  toggleMark,
  onHiddenMarksChange,
}) => {
  const { state: message } = emptyStateOf({
    name: 'all-hidden',
    title: 'All marks are hidden',
    line: 'The legend hides every box of this view.',
    action: 'Show all marks',
    act: () => {
      for (const mark of [...hiddenMarks()]) toggleMark(mark);
    },
    icon: [svgOf('rect', { x: 6, y: 9, width: 16, height: 10, rx: 2, 'stroke-dasharray': '3 3' })],
  });
  message.hidden = true;
  graph.append(message);

  const show = (level: Laid): void => {
    const hidden = hiddenIdsOf(level, hiddenMarks());
    message.hidden = level.boxes.length === 0 || !level.boxes.every(({ id }) => hidden.has(id));
  };
  onLevelChange(show);
  onHiddenMarksChange(() => {
    show(levelOf());
  });
};

export default allHidden;
