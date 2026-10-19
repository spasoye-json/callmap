import { hopsOf, oneHopFrom } from '@archmap/review';
import type { PagePart } from '../reader-page.ts';
import { diffView } from '../views/diff.ts';

const nextHop: PagePart = (page) => {
  const hops = hopsOf(page.data.branchGraph.calls);
  page.onBoxClick(({ id, pageFunction: { mark } }) => {
    if (page.currentView() !== diffView) return;
    if (mark === undefined || mark === 'neighbour')
      void page.show([id, ...oneHopFrom(hops, id)], id);
  });
};

export default nextHop;
