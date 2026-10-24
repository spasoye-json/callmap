import { sectionHeadOf, spanOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';
import { countTextOf } from '../words.ts';

const resolutionRate: PagePart = ({ data, panels }) => {
  const { resolved, open, rate } = data.review.resolutionRate;
  const { name, version } = data.branchGraph.checker;
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Resolution rate');
  section.className = 'resolution-rate';
  section.title = 'Calls in the whole repo in scope. A one-of group counts as one call.';

  const value = document.createElement('p');
  value.className = 'rate';
  const percent = document.createElement('span');
  percent.className = 'rate-value';
  percent.textContent = `${(rate * 100).toFixed(1)}%`;
  value.append(percent, ' of calls proved');
  const bar = document.createElement('div');
  bar.className = 'rate-bar';
  const filled = document.createElement('span');
  filled.style.width = `${String(rate * 100)}%`;
  bar.append(filled);
  const calls = document.createElement('p');
  calls.className = 'rate-calls';
  calls.textContent = `${countTextOf(resolved)} of ${countTextOf(resolved + open)} calls`;

  section.append(
    sectionHeadOf('Resolution', spanOf('checker', `${name} ${version}`)),
    value,
    bar,
    calls,
  );
  panels.prepend(section);
};

export default resolutionRate;
