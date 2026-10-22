import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReaderPageData } from '../page/data.ts';
import { placementOf } from '../page/layout.ts';
import type { Scene } from '../page/scene.ts';
import type { Choice, View } from '../page/view.ts';
import { diffView } from '../page/views/diff.ts';
import { folderView } from '../page/views/folder.ts';
import { routeView } from '../page/views/route.ts';
import { wholeProjectView } from '../page/views/whole-project.ts';
import { featureBranchRepo, levelsRepo } from './fixture-repo.ts';
import { pageDataOf, reviewHtmlOf } from './reader-page.ts';

const MODEL_ORDER = 'elk.layered.considerModelOrder.strategy';

let levels: ReaderPageData;
let review: ReaderPageData;

beforeAll(() => {
  levels = pageDataOf(reviewHtmlOf(levelsRepo()));
  review = pageDataOf(reviewHtmlOf(featureBranchRepo()));
}, 120_000);

const framesAndRootOf = (node: ElkNode): readonly ElkNode[] =>
  node.children === undefined
    ? []
    : [node, ...node.children.flatMap((child) => framesAndRootOf(child))];

const modelOrdersOf = (graph: ElkNode): Readonly<Record<string, string | undefined>> =>
  Object.fromEntries(
    framesAndRootOf(graph).map(({ id, layoutOptions }) => [id, layoutOptions?.[MODEL_ORDER]]),
  );

const graphSentToElkOf = async (scene: Scene): Promise<ElkNode> => {
  const layout = vi.spyOn(ELK.prototype, 'layout');
  try {
    await placementOf(scene);
    const graph = layout.mock.lastCall?.[0] as ElkNode | undefined;
    if (graph === undefined) throw new Error('ELK did not lay out the scene');
    return graph;
  } finally {
    layout.mockRestore();
  }
};

const levelGraphOf = (choice: Choice | undefined): Promise<ElkNode> =>
  graphSentToElkOf(wholeProjectView.sceneOf(levels, new Set(), choice));

describe('the model order of the ELK layout', () => {
  it('is NONE at the top level of the Whole project view', async () => {
    const graph = await levelGraphOf(wholeProjectView.firstChoice?.(levels));
    expect(modelOrdersOf(graph)).toEqual({ root: 'NONE' });
  });

  it('is NONE on the root of a level below the top, and its frames take the ELK default NONE', async () => {
    const graph = await levelGraphOf({ kind: 'level', path: 'src/orders' });
    expect(modelOrdersOf(graph)).toEqual({
      root: 'NONE',
      'folder:src/orders': undefined,
    });
  });

  it.each<{ readonly view: View; readonly choice?: Choice }>([
    { view: diffView },
    { view: folderView, choice: { kind: 'folder', folder: 'src' } },
    { view: routeView },
  ])(
    'stays NODES_AND_EDGES on the root of the $view.name view, with no model order on its frames',
    async ({ view, choice }) => {
      const [root, ...frames] = Object.entries(
        modelOrdersOf(await graphSentToElkOf(view.sceneOf(review, new Set(), choice))),
      );
      expect(root).toEqual(['root', 'NODES_AND_EDGES']);
      expect(frames.filter(([, order]) => order !== undefined)).toEqual([]);
    },
  );
});
