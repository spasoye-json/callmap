import type { FunctionMark } from '@callmap/review';
import { chipOf } from '../chips.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const MARKS: readonly (readonly [FunctionMark, string])[] = [
  ['changed', 'Changed'],
  ['added', 'Added'],
  ['removed', 'Removed'],
  ['neighbour', 'Neighbour'],
];

const HIDDEN_MARKS = 'data-hidden-marks';

const countOf = (count: number): HTMLElement => {
  const element = document.createElement('span');
  element.className = 'count';
  element.textContent = count.toLocaleString('en-US');
  return element;
};

const labelOf = (text: string): HTMLElement => {
  const element = document.createElement('span');
  element.className = 'label';
  element.textContent = text;
  return element;
};

const callSampleOf = (kind: string): SVGSVGElement => {
  const sample = svgOf(
    'svg',
    { class: `sample ${kind}`, viewBox: '0 0 22 16', 'aria-hidden': 'true' },
    svgOf('path', { d: kind === 'open-end' ? 'M1 8H15' : 'M1 8H21' }),
  );
  if (kind === 'open-end') sample.append(svgOf('circle', { cx: 18, cy: 8, r: 3 }));
  return sample;
};

const headOf = (title: string, note: string): HTMLElement => {
  const head = document.createElement('div');
  head.className = 'section-head';
  const eyebrow = document.createElement('h2');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = title;
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = note;
  head.append(eyebrow, hint);
  return head;
};

const marks: PagePart = ({ data, graph, panels }) => {
  const hidden = new Set<FunctionMark>();
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Marks');
  section.className = 'marks';

  const markRows = MARKS.map(([mark, name]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'legend-row';
    button.setAttribute('aria-pressed', 'false');
    const count = data.review.functions.filter((marked) => marked.mark === mark).length;
    button.append(chipOf(mark), labelOf(name), ' ', countOf(count));
    button.addEventListener('click', () => {
      if (hidden.has(mark)) hidden.delete(mark);
      else hidden.add(mark);
      button.setAttribute('aria-pressed', String(hidden.has(mark)));
      graph.setAttribute(HIDDEN_MARKS, [...hidden].join(' '));
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
    row.append(callSampleOf(kind), labelOf(name), ' ', countOf(count));
    return row;
  });

  section.append(headOf('Marks', 'Click to hide'), ...markRows, callsHead, ...callRows);
  panels.append(section);
};

export default marks;
