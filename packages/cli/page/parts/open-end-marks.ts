import type { NodeSingular } from 'cytoscape';
import type { FunctionId, OpenEnd } from '@archmap/graph-document';
import { appendTo } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { BOX_WIDTH } from '../layout.ts';
import type { GraphStyle, PagePart } from '../reader-page.ts';

const END_WIDTH = 96;
const END_HEIGHT = 20;
const END_GAP = 18;

const openEndStyle: GraphStyle = (colours) => [
  {
    selector: 'node.open-end',
    style: {
      shape: 'round-rectangle',
      width: END_WIDTH,
      height: END_HEIGHT,
      'background-color': colours.paper,
      'border-color': colours.removed,
      'border-width': 1,
      'border-style': 'dashed',
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': `${END_WIDTH - 10}px`,
      'font-size': 9,
      color: colours.removed,
    },
  },
  {
    selector: 'edge.open-end',
    style: {
      width: 1,
      'curve-style': 'straight',
      'line-style': 'dashed',
      'line-color': colours.removed,
      'target-arrow-color': colours.removed,
      'target-arrow-shape': 'tee',
    },
  },
];

const endPosition = (caller: NodeSingular, index: number) => ({
  x: caller.position('x') + BOX_WIDTH / 2 + END_GAP + END_WIDTH / 2,
  y: caller.position('y') + index * (END_HEIGHT + 4),
});

const openEndsByCallerOf = ({
  review,
  branchGraph,
}: ReaderPageData): ReadonlyMap<FunctionId, readonly OpenEnd[]> => {
  const reviewed = new Set(review.functions.map(({ id }) => id));
  const byCaller = new Map<FunctionId, OpenEnd[]>();
  for (const openEnd of [
    ...review.openEnds,
    ...branchGraph.openEnds.filter(({ caller }) => !reviewed.has(caller)),
  ]) {
    appendTo(byCaller, openEnd.caller, openEnd);
  }
  return byCaller;
};

const openEndMarks: PagePart = ({ data, graph, addGraphStyle }) => {
  addGraphStyle(openEndStyle);
  const openEndsByCaller = openEndsByCallerOf(data);

  const markOpenEnds = (caller: NodeSingular): void => {
    (openEndsByCaller.get(caller.id()) ?? []).forEach(({ line, expression }, index) => {
      const id = `open-end:${caller.id()}:${String(index)}`;
      graph.add([
        {
          group: 'nodes',
          data: { id, label: `${expression} :${String(line)}`, caller: caller.id(), index },
          position: endPosition(caller, index),
          classes: 'open-end',
          selectable: false,
        },
        {
          group: 'edges',
          data: { id: `${id}:arrow`, source: caller.id(), target: id },
          classes: 'open-end',
          selectable: false,
        },
      ]);
    });
  };

  graph.batch(() => {
    graph.nodes('.function').forEach(markOpenEnds);
  });
  graph.on('add', 'node.function', (event) => {
    markOpenEnds(event.target as NodeSingular);
  });
  graph.on('position', 'node.function', (event) => {
    const caller = event.target as NodeSingular;
    graph.nodes('.open-end').forEach((end) => {
      if (end.data('caller') === caller.id()) {
        end.position(endPosition(caller, end.data('index') as number));
      }
    });
  });
};

export default openEndMarks;
