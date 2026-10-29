import type { Checkout } from '../data.ts';
import { spanOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';

const DETACHED_HEAD = 'detached HEAD';

const namesOf = ({ branch, baseName }: Checkout): HTMLParagraphElement => {
  const names = document.createElement('p');
  names.className = 'checkout-names';
  names.append(
    spanOf('branch', branch ?? DETACHED_HEAD),
    ' ',
    spanOf('vs', 'vs'),
    ' ',
    spanOf('base', baseName),
  );
  return names;
};

const rangeOf = ({ baseCommit, headCommit, uncommitted }: Checkout): HTMLParagraphElement => {
  const range = document.createElement('p');
  range.className = 'checkout-range';
  range.textContent = `${baseCommit}…${headCommit}${uncommitted ? ' + uncommitted changes' : ''}`;
  return range;
};

const checkout: PagePart = ({ data }) => {
  const tabs = document.getElementById('views');
  const element = document.createElement('div');
  element.className = 'checkout';
  element.append(namesOf(data.checkout), rangeOf(data.checkout));
  tabs?.before(element);
};

export default checkout;
