import { DATA_BLOCK_ID } from './data.ts';
import type { ReaderPageData } from './data.ts';
import { interactionOf } from './interaction.ts';
import type { PagePart } from './reader-page.ts';
import { diffView } from './views/diff.ts';
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
    [diffView, wholeProjectView, routeView],
  );
  for (const part of parts) part(page);
  void render();
};
