import { hopsOf, oneHopFrom } from '@archmap/review';
import type { PagePart } from '../reader-page.ts';

const nextHop: PagePart = (page) => {
  const hops = hopsOf(page.data.branchGraph.calls);
  page.onBoxClick(({ id, marked }) => {
    if (marked.mark === 'neighbour') void page.show([id, ...oneHopFrom(hops, id)], id);
  });
};

export default nextHop;
