import { DATA_BLOCK_ID } from './data.ts';
import type { ReaderPageData } from './data.ts';
import { interactionOf } from './interaction.ts';
import type { PagePart } from './reader-page.ts';
import { sidePanelOf } from './side-panel.ts';
import { diffView } from './views/diff.ts';
import { folderView } from './views/folder.ts';
import { routeView } from './views/route.ts';
import { wholeProjectView } from './views/whole-project.ts';

const elementOf = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the reader page holds no #${id}`);
  return element;
};

export const startReaderPage = (parts: readonly PagePart[]): void => {
  const data = JSON.parse(elementOf(DATA_BLOCK_ID).textContent) as ReaderPageData;
  const { page, render } = interactionOf(
    data,
    { graph: elementOf('graph'), panels: elementOf('panels'), tabs: elementOf('views') },
    [diffView, wholeProjectView, folderView, routeView],
  );
  const leftPanel = sidePanelOf({
    side: 'left',
    label: 'Left panel',
    name: 'left panel',
    body: page.panels,
    widthKey: 'callmap.left-panel.width',
    defaultWidth: 320,
    open: true,
    onChange: page.keepSelectionInView,
  });
  page.graph.before(leftPanel.element);
  for (const part of parts) part(page);
  void render();
};
