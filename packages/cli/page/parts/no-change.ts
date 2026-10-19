import type { PagePart } from '../reader-page.ts';

const noChange: PagePart = ({ data, graph }) => {
  if (data.review.functions.length > 0) return;
  const message = document.createElement('p');
  message.className = 'no-change';
  message.setAttribute('role', 'status');
  message.textContent = 'The branch changed no function against its base.';
  graph.hidden = true;
  graph.before(message);
};

export default noChange;
