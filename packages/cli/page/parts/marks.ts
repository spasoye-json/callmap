import type { FunctionMark } from '@callmap/review';
import { chipOf } from '../chips.ts';
import { sectionHeadOf, spanOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const MARKS: readonly (readonly [FunctionMark, string])[] = [
  ['changed', 'Changed'],
  ['added', 'Added'],
  ['removed', 'Removed'],
  ['neighbour', 'Neighbour'],
];

const countSpanOf = (count: number): HTMLSpanElement =>
  spanOf('count', count.toLocaleString('en-US'));

const callSampleOf = (kind: string): SVGSVGElement => {
  const sample = svgOf(
    'svg',
    { class: `sample ${kind}`, viewBox: '0 0 22 16', 'aria-hidden': 'true' },
    svgOf('path', { d: kind === 'open-end' ? 'M1 8H15' : 'M1 8H21' }),
  );
  if (kind === 'open-end') sample.append(svgOf('circle', { cx: 18, cy: 8, r: 3 }));
  return sample;
};

const marks: PagePart = ({ data, panels, hiddenMarks, toggleMark }) => {
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
      button.setAttribute('aria-pressed', String(hiddenMarks().has(mark)));
    });
    return button;
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
    ...markRows,
    callsHead,
    ...callRows,
  );
  panels.append(section);
};

export default marks;
