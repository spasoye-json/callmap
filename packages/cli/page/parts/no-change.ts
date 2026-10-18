import type { PagePart } from '../reader-page.ts';

const noChange: PagePart = ({ data, graph }) => {
  if (data.review.functions.length > 0) return;
  const container = graph.container();
  if (container === null) return;
  const message = document.createElement('p');
  message.className = 'no-change';
  message.setAttribute('role', 'status');
  message.textContent = 'The branch changed no function against its base.';
  container.hidden = true;
  container.before(message);
};

export default noChange;
