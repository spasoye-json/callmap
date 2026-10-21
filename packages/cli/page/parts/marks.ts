import type { FunctionMark } from '@callmap/review';
import { chipOf } from '../chips.ts';
import { hiddenIdsOf } from '../hidden-parts.ts';
import type { Laid } from '../layout.ts';
import { sectionHeadOf, spanOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';
import { countTextOf } from '../words.ts';

const MARKS: readonly (readonly [FunctionMark, string])[] = [
  ['changed', 'Changed'],
  ['added', 'Added'],
  ['removed', 'Removed'],
  ['neighbour', 'Neighbour'],
];

const HIDDEN = 'data-mark-hidden';

const countSpanOf = (count: number): HTMLSpanElement => spanOf('count', countTextOf(count));

const callSampleOf = (kind: string): SVGSVGElement => {
  const sample = svgOf(
    'svg',
    { class: `sample ${kind}`, viewBox: '0 0 22 16', 'aria-hidden': 'true' },
    svgOf('path', { d: kind === 'open-end' ? 'M1 8H15' : 'M1 8H21' }),
  );
  if (kind === 'open-end') sample.append(svgOf('circle', { cx: 18, cy: 8, r: 3 }));
  return sample;
};

const endsOf = (element: Element): readonly (string | null)[] =>
  element.hasAttribute('data-from')
    ? [element.getAttribute('data-from'), element.getAttribute('data-to')]
    : [element.getAttribute('data-box') ?? element.getAttribute('data-frame')];

const hideParts = (graph: HTMLElement, level: Laid, marks: ReadonlySet<FunctionMark>): void => {
  const hidden = hiddenIdsOf(level, marks);
  for (const element of graph.querySelectorAll('[data-box], [data-frame], [data-from]')) {
    element.toggleAttribute(
      HIDDEN,
      endsOf(element).some((id) => id !== null && hidden.has(id)),
    );
  }
  const hiddenMarks: ReadonlySet<string> = marks;
  for (const count of graph.querySelectorAll('.count[data-mark]')) {
    count.toggleAttribute(HIDDEN, hiddenMarks.has(count.getAttribute('data-mark') ?? ''));
  }
};

const marks: PagePart = ({
  data,
  graph,
  onLevelChange,
  panels,
  hiddenMarks,
  toggleMark,
  onHiddenMarksChange,
}) => {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Marks');
  section.className = 'marks';

  const markRows = MARKS.map(([mark, name]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'legend-row';
    button.setAttribute('aria-pressed', 'false');
    const count = data.review.functions.filter((marked) => marked.mark === mark).length;
    button.append(chipOf(mark), spanOf('label', name), ' ', countSpanOf(count));
    button.addEventListener('click', () => {
      toggleMark(mark);
    });
    return [mark, button] as const;
  });

  const callsHead = document.createElement('p');
  callsHead.className = 'legend-sub';
  callsHead.textContent = 'Calls';
  const { calls, oneOfGroups, openEnds } = data.review;
  const callRows = (
    [
      ['added', 'Added call', calls.filter(({ mark }) => mark === 'added').length],
      ['removed', 'Removed call', calls.filter(({ mark }) => mark === 'removed').length],
      ['one-of', 'One of a group', oneOfGroups.length],
      ['open-end', 'Open end', openEnds.length],
    ] as const
  ).map(([kind, name, count]) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.append(callSampleOf(kind), spanOf('label', name), ' ', countSpanOf(count));
    return row;
  });

  section.append(
    sectionHeadOf('Marks', spanOf('hint', 'Click to hide')),
    ...markRows.map(([, button]) => button),
    callsHead,
    ...callRows,
  );
  panels.append(section);

  let drawn: Laid | undefined;
  onLevelChange((level) => {
    if (level === drawn) return;
    drawn = level;
    hideParts(graph, level, hiddenMarks());
  });
  onHiddenMarksChange((hidden) => {
    for (const [mark, button] of markRows)
      button.setAttribute('aria-pressed', String(hidden.has(mark)));
    if (drawn !== undefined) hideParts(graph, drawn, hidden);
  });
};

export default marks;
