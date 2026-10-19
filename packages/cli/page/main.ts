import { DATA_BLOCK_ID } from './data.ts';
import type { ReaderPageData } from './data.ts';
import { interactionOf } from './interaction.ts';
import type { PagePart } from './reader-page.ts';
import { diffView } from './views/diff.ts';

const elementOf = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the reader page holds no #${id}`);
  return element;
};

export const startReaderPage = (parts: readonly PagePart[]): void => {
  const data = JSON.parse(elementOf(DATA_BLOCK_ID).textContent) as ReaderPageData;
  const { page, render } = interactionOf(data, elementOf('graph'), elementOf('panels'), diffView);
  for (const part of parts) part(page);
  void render();
};
