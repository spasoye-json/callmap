import type { StylesheetJson } from 'cytoscape';
import { BOX_HEIGHT, BOX_WIDTH } from './layout.ts';

const TOKENS = ['ink', 'muted', 'paper', 'frame', 'added', 'removed', 'changed'] as const;

export type Colours = Readonly<Record<(typeof TOKENS)[number], string>>;

export const coloursOf = (root: HTMLElement): Colours => {
  const computed = getComputedStyle(root);
  const read = (token: string): string => computed.getPropertyValue(`--${token}`).trim() || 'grey';
  return Object.fromEntries(TOKENS.map((token) => [token, read(token)])) as Colours;
};

export const graphStyle = (colours: Colours): StylesheetJson => [
  {
    selector: 'node.file-frame',
    style: {
      shape: 'round-rectangle',
      'background-color': colours.frame,
      'border-color': colours.muted,
      'border-width': 1,
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'font-size': 12,
      color: colours.muted,
      padding: '14px',
    },
  },
  {
    selector: 'node.function',
    style: {
      shape: 'round-rectangle',
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      'background-color': colours.paper,
      'border-color': colours.ink,
      'border-width': 2,
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': `${BOX_WIDTH - 16}px`,
      'font-size': 12,
      color: colours.ink,
    },
  },
  { selector: 'node.added', style: { 'border-color': colours.added, 'border-width': 3 } },
  {
    selector: 'node.removed',
    style: { 'border-color': colours.removed, 'border-width': 3, 'border-style': 'dashed' },
  },
  { selector: 'node.changed', style: { 'border-color': colours.changed, 'border-width': 3 } },
  {
    selector: 'node.neighbour',
    style: { 'border-color': colours.muted, 'border-width': 1, color: colours.muted },
  },
  {
    selector: 'edge.call',
    style: {
      width: 1.5,
      'curve-style': 'bezier',
      'line-color': colours.muted,
      'target-arrow-color': colours.muted,
      'target-arrow-shape': 'triangle',
    },
  },
  {
    selector: 'edge.added',
    style: { width: 2.5, 'line-color': colours.added, 'target-arrow-color': colours.added },
  },
  {
    selector: 'edge.removed',
    style: {
      width: 2.5,
      'line-style': 'dashed',
      'line-color': colours.removed,
      'target-arrow-color': colours.removed,
    },
  },
];
