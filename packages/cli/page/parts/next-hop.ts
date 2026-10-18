import { hopOpenerOf } from '../hops.ts';
import { targetIdOf } from '../reader-page.ts';
import type { PagePart } from '../reader-page.ts';

const nextHop: PagePart = (page) => {
  const { openHop } = hopOpenerOf(page);
  page.graph.on('tap', 'node.neighbour', (event) => {
    openHop(targetIdOf(event));
  });
};

export default nextHop;
