/**
 * The canvas model as Cytoscape draws it. Every position and size comes from the deterministic
 * layout through the canvas model, so Cytoscape runs the preset layout and decides nothing: a flow
 * draws the same way every time it opens.
 */

import type { ElementDefinition, StylesheetJson } from 'cytoscape';
import type { CanvasEdge, CanvasModel, NodeShape } from '@archmap/canvas-model';
import { boundariesOf } from '@archmap/canvas-model';
import { DEFAULT_LAYOUT_OPTIONS } from '@archmap/layout';
import type { Rect } from '@archmap/layout';

const SHAPES: Readonly<Record<NodeShape, string>> = {
  rectangle: 'round-rectangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  parallelogram: 'rhomboid',
  band: 'round-rectangle',
};

const centreOf = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

const edgeLabelOf = (edge: CanvasEdge): string => {
  if (edge.sources.length > 1) return `${String(edge.sources.length)} edges`;
  return [...new Set(boundariesOf(edge))].join(', ');
};

export const elementsOf = (model: CanvasModel): ElementDefinition[] => [
  ...model.lanes.map((lane): ElementDefinition => ({
    group: 'nodes',
    data: {
      id: lane.selectionId,
      label: lane.name,
      width: lane.rect.width,
      height: lane.rect.height,
      labelShift: DEFAULT_LAYOUT_OPTIONS.laneHeaderWidth / 2 - lane.rect.width / 2,
    },
    position: centreOf(lane.rect),
    classes: 'lane',
    selectable: false,
    grabbable: false,
  })),
  ...model.nodes.map((node): ElementDefinition => ({
    group: 'nodes',
    data: {
      id: node.id,
      label:
        node.kind === 'lane-summary'
          ? `${node.label}: ${String(node.collapsedCount)} nodes folded`
          : node.label,
      width: node.rect.width,
      height: node.rect.height,
      shape: SHAPES[node.shape],
    },
    position: centreOf(node.rect),
    classes: node.kind === 'lane-summary' ? 'band' : `flow-node kind-${node.kind}`,
    grabbable: false,
  })),
  ...model.edges.map((edge): ElementDefinition => ({
    group: 'edges',
    data: { id: edge.id, source: edge.from, target: edge.to, label: edgeLabelOf(edge) },
    classes: `ink-${edge.ink} kind-${edge.kind}`,
  })),
];

export interface CanvasColours {
  readonly ink: string;
  readonly muted: string;
  readonly panel: string;
  readonly lane: string;
  readonly rule: string;
  readonly accent: string;
  readonly verified: string;
  readonly inferred: string;
  readonly error: string;
}

/** The light theme, for a page whose stylesheet has not loaded, such as a test. */
const FALLBACK_COLOURS: CanvasColours = {
  ink: '#1d232a',
  muted: '#5d6874',
  panel: '#ffffff',
  lane: '#eef1f4',
  rule: '#d9dee4',
  accent: '#2f6fdf',
  verified: '#2e7d4f',
  inferred: '#b06a00',
  error: '#c0392b',
};

/** Cytoscape paints on a canvas, which reads no CSS, so the theme's tokens are read once here. */
export const coloursOf = (root: Element): CanvasColours => {
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string): string =>
    style.getPropertyValue(`--${name}`).trim() || fallback;
  return {
    ink: token('ink', FALLBACK_COLOURS.ink),
    muted: token('muted', FALLBACK_COLOURS.muted),
    panel: token('panel', FALLBACK_COLOURS.panel),
    lane: token('lane', FALLBACK_COLOURS.lane),
    rule: token('rule', FALLBACK_COLOURS.rule),
    accent: token('accent', FALLBACK_COLOURS.accent),
    verified: token('verified', FALLBACK_COLOURS.verified),
    inferred: token('inferred', FALLBACK_COLOURS.inferred),
    error: token('error', FALLBACK_COLOURS.error),
  };
};

export const canvasStyle = (colours: CanvasColours): StylesheetJson => [
  {
    selector: 'node',
    style: {
      'z-index-compare': 'manual',
      'z-index': 2,
      width: 'data(width)',
      height: 'data(height)',
      label: 'data(label)',
      color: colours.ink,
      'font-size': 13,
      'text-wrap': 'wrap',
      'text-max-width': 'data(width)',
      'text-valign': 'center',
      'text-halign': 'center',
      'background-color': colours.panel,
      'border-width': 1.5,
      'border-color': colours.muted,
    },
  },
  { selector: 'node.flow-node', style: { shape: 'data(shape)' as never } },
  { selector: 'node.kind-error', style: { 'border-color': colours.error } },
  { selector: 'node.kind-side-effect', style: { 'border-width': 2.5 } },
  {
    selector: 'node.lane',
    style: {
      'z-index': 0,
      events: 'no',
      shape: 'rectangle',
      'background-color': colours.lane,
      'border-width': 0,
      color: colours.muted,
      'font-size': 14,
      'font-weight': 'bold',
      'text-margin-x': 'data(labelShift)' as never,
      'text-max-width': `${String(DEFAULT_LAYOUT_OPTIONS.laneHeaderWidth - 16)}px`,
    },
  },
  {
    selector: 'node.band',
    style: {
      shape: 'round-rectangle',
      'border-style': 'dashed',
      'background-color': colours.lane,
      color: colours.muted,
    },
  },
  {
    selector: 'edge',
    style: {
      'z-index-compare': 'manual',
      'z-index': 1,
      width: 2,
      'curve-style': 'taxi',
      'taxi-direction': 'rightward',
      'target-arrow-shape': 'triangle',
      label: 'data(label)',
      'font-size': 11,
      color: colours.muted,
      'text-background-color': colours.panel,
      'text-background-opacity': 1,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge.ink-solid',
    style: { 'line-color': colours.verified, 'target-arrow-color': colours.verified },
  },
  {
    selector: 'edge.ink-dashed',
    style: {
      'line-style': 'dashed',
      'line-color': colours.inferred,
      'target-arrow-color': colours.inferred,
    },
  },
  {
    selector: ':selected',
    style: { 'border-color': colours.accent, 'border-width': 3, 'line-color': colours.accent },
  },
];
