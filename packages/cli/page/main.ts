import cytoscape from 'cytoscape';
import { DATA_BLOCK_ID } from './data.ts';
import type { ReaderPageData } from './data.ts';
import { elementsOf } from './elements.ts';
import { coloursOf, graphStyle } from './graph-style.ts';
import type { PagePart, ReaderPage } from './reader-page.ts';

const elementOf = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the reader page holds no #${id}`);
  return element;
};

export const startReaderPage = (parts: readonly PagePart[]): void => {
  const data = JSON.parse(elementOf(DATA_BLOCK_ID).textContent) as ReaderPageData;
  const root = document.documentElement;
  const graph = cytoscape({
    container: elementOf('graph'),
    elements: elementsOf(data.review),
    style: graphStyle(coloursOf(root)),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 2.5,
    boxSelectionEnabled: false,
    autoungrabify: true,
  });
  graph.fit(undefined, 40);

  if ('matchMedia' in window) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      graph.style(graphStyle(coloursOf(root)));
    });
  }

  const page: ReaderPage = { data, graph, panels: elementOf('panels') };
  window.readerPage = page;
  for (const part of parts) part(page);
};
