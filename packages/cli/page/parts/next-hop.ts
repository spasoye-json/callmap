import { hopOpenerOf } from '../hops.ts';
import type { PagePart } from '../reader-page.ts';

const nextHop: PagePart = (page) => {
  const { openHop } = hopOpenerOf(page);
  page.graph.on('tap', 'node.neighbour', (event) => {
    openHop((event.target as { id: () => string }).id());
  });
};

export default nextHop;
