import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkLabel, ElkNode } from 'elkjs/lib/elk-api.js';
import { appendTo, byText } from '@callmap/review';
import {
  COUNTS_GAP,
  ICON_ROOM,
  LEVEL_BOX_HEIGHT,
  LEVEL_PADDING,
  countWidthOf,
  functionCountWidthOf,
} from './box-sizes.ts';
import { arrowKeyOf, chipMarkOf, lineLabelOf, markCountsOf } from './scene.ts';
import type { LevelBox, Scene, SceneBox, SceneFrame, SceneLine } from './scene.ts';

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
  'elk.layered.thoroughness': '3',
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
const CHIP_ROOM = 24;

const widthOf = (text: string, perCharacter: number, padding: number): number =>
  Math.ceil(text.length * perCharacter) + padding;

const countsWidthOf = ({ counts }: LevelBox): number =>
  markCountsOf(counts).reduce(
    (width, { count }, index) => width + countWidthOf(count) + (index === 0 ? 0 : COUNTS_GAP),
    2 * LEVEL_PADDING,
  );

const boxNodeOf = (box: SceneBox): ElkNode => {
  switch (box.kind) {
    case 'function':
      return {
        id: box.id,
        width: Math.max(
          96,
          widthOf(box.label, 7, chipMarkOf(box) === undefined ? 24 : 24 + CHIP_ROOM),
        ),
        height: BOX_HEIGHT,
      };
    case 'open-end':
      return { id: box.id, width: widthOf(box.label, 6, 16), height: OPEN_END_HEIGHT };
    case 'folder':
    case 'file':
      return {
        id: box.id,
        width: Math.max(
          96,
          widthOf(box.label, 7, 2 * LEVEL_PADDING + ICON_ROOM) +
            (box.outside ? 0 : functionCountWidthOf(box.counts.functions)),
          countsWidthOf(box),
        ),
        height: LEVEL_BOX_HEIGHT,
      };
  }
};

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

export type Place = readonly [x: number, y: number, width: number, height: number];

export interface PlacedLine {
  readonly points: readonly Point[];
  readonly label?: Place;
}

export interface Placement {
  readonly frames: readonly Place[];
  readonly boxes: readonly Place[];
  readonly lines: readonly PlacedLine[];
  readonly width: number;
  readonly height: number;
}

const placeOf = ({ x, y, width, height }: ElkNode | ElkLabel): Place => [
  rounded(x),
  rounded(y),
  rounded(width),
  rounded(height),
];

const placedOf = (root: ElkNode): ReadonlyMap<string, Place> => {
  const placed = new Map<string, Place>();
  const walk = (node: ElkNode): void => {
    for (const child of node.children ?? []) {
      placed.set(child.id, placeOf(child));
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

const NOWHERE: Place = [0, 0, 0, 0];

let elk: InstanceType<typeof ELK> | undefined;

export const placementOf = async (scene: Scene): Promise<Placement> => {
  elk ??= new ELK();
  const laid = await elk.layout(graphOf(scene));
  const placed = placedOf(laid);
  const placeFor = ({ id }: { readonly id: string }): Place => placed.get(id) ?? NOWHERE;
  const edges = new Map((laid.edges ?? []).map((edge) => [edge.id, edge]));
  return {
    frames: scene.frames.map(placeFor),
    boxes: scene.boxes.map(placeFor),
    lines: scene.lines.map((line): PlacedLine => {
      const edge = edges.get(lineIdOf(line));
      const label = edge?.labels?.[0];
      return {
        points: pointsOf(edge),
        ...(label?.text === undefined ? {} : { label: placeOf(label) }),
      };
    }),
    width: rounded(laid.width),
    height: rounded(laid.height),
  };
};

const rectOf = ([x, y, width, height]: Place = NOWHERE): Rect => ({ x, y, width, height });

export const laidOf = (scene: Scene, placement: Placement): Laid => ({
  frames: scene.frames.map((frame, index) => ({ ...frame, ...rectOf(placement.frames[index]) })),
  boxes: scene.boxes.map((box, index) => ({ ...box, ...rectOf(placement.boxes[index]) })),
  lines: scene.lines.map((line, index) => {
    const placed = placement.lines[index];
    const text = lineLabelOf(line);
    return {
      ...line,
      points: placed?.points ?? [],
      ...(placed?.label === undefined || text === undefined
        ? {}
        : { label: { ...rectOf(placed.label), text } }),
    };
  }),
  width: placement.width,
  height: placement.height,
});

export const layoutOf = async (scene: Scene): Promise<Laid> =>
  laidOf(scene, await placementOf(scene));
