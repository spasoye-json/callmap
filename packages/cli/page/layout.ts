import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkLabel, ElkNode } from 'elkjs/lib/elk-api.js';
import { appendTo, byText } from '@callmap/review';
import { arrowKeyOf, lineLabelOf } from './scene.ts';
import type { Scene, SceneBox, SceneFrame, SceneLine } from './scene.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Point = readonly [number, number];

export interface LineLabel extends Rect {
  readonly text: string;
}

export type LaidBox = SceneBox & Rect;
export type LaidFrame = SceneFrame & Rect;
export type LaidLine = SceneLine & {
  readonly points: readonly Point[];
  readonly label?: LineLabel;
};

export interface Laid {
  readonly frames: readonly LaidFrame[];
  readonly boxes: readonly LaidBox[];
  readonly lines: readonly LaidLine[];
  readonly width: number;
  readonly height: number;
}

const OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.spacing.nodeNodeBetweenLayers': '56',
  'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
  'elk.spacing.nodeNode': '14',
  'elk.spacing.edgeNode': '12',
  'elk.spacing.edgeEdge': '8',
  'elk.spacing.componentComponent': '40',
  'elk.padding': '[top=20,left=20,bottom=20,right=20]',
};

// ELK reads the cycle breaking from the parent of the boxes, so each frame carries it too.
const CYCLE_BREAKING: Readonly<Record<string, string>> = {
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
};

const FRAME_PADDING = '[top=30,left=12,bottom=12,right=12]';
const BOX_HEIGHT = 30;
const OPEN_END_HEIGHT = 22;
const LABEL_HEIGHT = 16;

const widthOf = (text: string, perCharacter: number, padding: number): number =>
  Math.ceil(text.length * perCharacter) + padding;

const boxNodeOf = (box: SceneBox): ElkNode =>
  box.kind === 'function'
    ? { id: box.id, width: Math.max(96, widthOf(box.label, 7, 24)), height: BOX_HEIGHT }
    : { id: box.id, width: widthOf(box.label, 6, 16), height: OPEN_END_HEIGHT };

const frameNodeOf = (frame: SceneFrame, children: ElkNode[]): ElkNode => ({
  id: frame.id,
  layoutOptions: {
    ...CYCLE_BREAKING,
    'elk.padding': FRAME_PADDING,
    'elk.nodeSize.constraints': '[MINIMUM_SIZE]',
    'elk.nodeSize.minimum': `(${String(widthOf(frame.label, 6.6, 28))}, 40)`,
  },
  children,
});

const lineIdOf = ({ kind, from, to }: SceneLine): string => `${kind}:${arrowKeyOf(from, to)}`;

const byId = <Item extends { readonly id: string }>(left: Item, right: Item): number =>
  byText(left.id, right.id);

const edgeOf = (line: SceneLine): ElkExtendedEdge => {
  const text = lineLabelOf(line);
  return {
    id: lineIdOf(line),
    sources: [line.from],
    targets: [line.to],
    ...(text === undefined
      ? {}
      : { labels: [{ text, width: widthOf(text, 6, 10), height: LABEL_HEIGHT }] }),
  };
};

const graphOf = ({ frames, boxes, lines }: Scene): ElkNode => {
  const childrenOf = new Map<string, ElkNode[]>();
  const frameIds = new Set(frames.map(({ id }) => id));
  for (const box of [...boxes].sort(byId)) {
    appendTo(childrenOf, frameIds.has(box.frame) ? box.frame : '', boxNodeOf(box));
  }
  const sorted = [...frames].sort(byId);
  const nodeOf = (frame: SceneFrame): ElkNode =>
    frameNodeOf(frame, [
      ...sorted.filter(({ parent }) => parent === frame.id).map(nodeOf),
      ...(childrenOf.get(frame.id) ?? []),
    ]);
  return {
    id: 'root',
    layoutOptions: { ...OPTIONS, ...CYCLE_BREAKING },
    children: [
      ...sorted.filter(({ parent }) => parent === undefined || !frameIds.has(parent)).map(nodeOf),
      ...(childrenOf.get('') ?? []),
    ],
    edges: lines.map(edgeOf).sort(byId),
  };
};

const rounded = (value: number | undefined): number => Math.round((value ?? 0) * 100) / 100;

const rectOf = ({ x, y, width, height }: ElkNode | ElkLabel): Rect => ({
  x: rounded(x),
  y: rounded(y),
  width: rounded(width),
  height: rounded(height),
});

const placedOf = (root: ElkNode): ReadonlyMap<string, Rect> => {
  const placed = new Map<string, Rect>();
  const walk = (node: ElkNode): void => {
    for (const child of node.children ?? []) {
      placed.set(child.id, rectOf(child));
      walk(child);
    }
  };
  walk(root);
  return placed;
};

const pointsOf = (edge: ElkExtendedEdge | undefined): readonly Point[] =>
  (edge?.sections ?? []).flatMap((section) =>
    [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }): Point => [
      rounded(x),
      rounded(y),
    ]),
  );

const labelOf = (edge: ElkExtendedEdge | undefined): LineLabel | undefined => {
  const label = edge?.labels?.[0];
  return label?.text === undefined ? undefined : { ...rectOf(label), text: label.text };
};

const elk = new ELK();

export const layoutOf = async (scene: Scene): Promise<Laid> => {
  const laid = await elk.layout(graphOf(scene));
  const placed = placedOf(laid);
  const rectFor = (id: string): Rect => placed.get(id) ?? { x: 0, y: 0, width: 0, height: 0 };
  const edges = new Map((laid.edges ?? []).map((edge) => [edge.id, edge]));
  return {
    frames: scene.frames.map((frame) => ({ ...frame, ...rectFor(frame.id) })),
    boxes: scene.boxes.map((box) => ({ ...box, ...rectFor(box.id) })),
    lines: scene.lines.map((line) => {
      const edge = edges.get(lineIdOf(line));
      const label = labelOf(edge);
      return { ...line, points: pointsOf(edge), ...(label === undefined ? {} : { label }) };
    }),
    width: rounded(laid.width),
    height: rounded(laid.height),
  };
};
