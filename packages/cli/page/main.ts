import cytoscape from 'cytoscape';
import { DATA_BLOCK_ID } from './data.ts';
import type { ReaderPageData } from './data.ts';
import { elementsOf } from './elements.ts';
import { coloursOf, graphStyle } from './graph-style.ts';
import type { GraphStyle, PagePart, ReaderPage } from './reader-page.ts';

const elementOf = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the reader page holds no #${id}`);
  return element;
};

export const startReaderPage = (parts: readonly PagePart[]): void => {
  const data = JSON.parse(elementOf(DATA_BLOCK_ID).textContent) as ReaderPageData;
  const root = document.documentElement;
  const styles: GraphStyle[] = [graphStyle];
  const styleOf = () => {
    const colours = coloursOf(root);
    return styles.flatMap((style) => style(colours));
  };
  const graph = cytoscape({
    container: elementOf('graph'),
    elements: elementsOf(data.review),
    style: styleOf(),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 2.5,
    boxSelectionEnabled: false,
    autoungrabify: true,
  });
  graph.fit(undefined, 40);

  const restyle = (): void => {
    graph.style(styleOf());
  };
  if ('matchMedia' in window) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', restyle);
  }

  const addGraphStyle = (style: GraphStyle): void => {
    styles.push(style);
    restyle();
  };
  const page: ReaderPage = { data, graph, panels: elementOf('panels'), addGraphStyle };
  window.readerPage = page;
  for (const part of parts) part(page);
};
