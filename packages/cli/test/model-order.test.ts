import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ReaderPageData } from '../page/data.ts';
import { elkGraphOf } from '../page/layout.ts';
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

const levelGraphOf = (path: string): ElkNode =>
  elkGraphOf(wholeProjectView.sceneOf(levels, new Set(), { kind: 'level', path }));

describe('the model order of the ELK layout', () => {
  it('is NONE at the top level of the Whole project view', () => {
    const graph = elkGraphOf(
      wholeProjectView.sceneOf(levels, new Set(), wholeProjectView.firstChoice?.(levels)),
    );
    expect(modelOrdersOf(graph)).toEqual({ root: 'NONE' });
  });

  it('is NONE on the root of a level below the top, and its frames take the ELK default NONE', () => {
    expect(modelOrdersOf(levelGraphOf('src/orders'))).toEqual({
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
    ({ view, choice }) => {
      const [root, ...frames] = Object.entries(
        modelOrdersOf(elkGraphOf(view.sceneOf(review, new Set(), choice))),
      );
      expect(root).toEqual(['root', 'NODES_AND_EDGES']);
      expect(frames.filter(([, order]) => order !== undefined)).toEqual([]);
    },
  );
});
