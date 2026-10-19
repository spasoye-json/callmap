import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import type { ResolutionRate } from '@callmap/review';
import type { PagePart } from '../reader-page.ts';

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const openEndList = (
  openEnds: readonly OpenEnd[],
  nameOf: ReadonlyMap<FunctionId, string>,
): readonly HTMLElement[] => {
  const heading = document.createElement('p');
  heading.id = 'open-ends-of-review';
  heading.className = 'open-ends-heading';
  heading.textContent = `In this review: ${counted(openEnds.length, 'open end', 'open ends')}`;
  const list = document.createElement('ul');
  list.className = 'open-ends';
  list.setAttribute('aria-labelledby', heading.id);
  for (const { caller, line, expression } of openEnds) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = expression;
    item.append(`${nameOf.get(caller) ?? caller}, line ${String(line)}: `, code);
    list.append(item);
  }
  return [heading, list];
};

const rateOf = ({ resolved, open, rate }: ResolutionRate): readonly HTMLElement[] => {
  const value = document.createElement('p');
  value.className = 'rate-value';
  value.textContent = `${(rate * 100).toFixed(1)}%`;
  const detail = document.createElement('p');
  detail.textContent = `In the whole repo in scope: ${counted(resolved, 'call resolved', 'calls resolved')}, ${counted(open, 'open end', 'open ends')}. A one-of group counts as one call.`;
  return [value, detail];
};

const resolutionRate: PagePart = ({ data, panels }) => {
  const nameOf = new Map(data.review.functions.map(({ id, name }) => [id, name]));
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Resolution rate');
  section.className = 'resolution-rate';
  section.append(
    ...rateOf(data.review.resolutionRate),
    ...openEndList(data.review.openEnds, nameOf),
  );
  panels.prepend(section);
};

export default resolutionRate;
