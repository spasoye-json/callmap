import type { Core, NodeSingular, StylesheetJson } from 'cytoscape';
import type { FunctionId, OpenEnd } from '@archmap/graph-document';
import type { ResolutionRate } from '@archmap/review';
import { callIdOf } from '../elements.ts';
import { coloursOf } from '../graph-style.ts';
import type { Colours } from '../graph-style.ts';
import { BOX_WIDTH } from '../layout.ts';
import type { PagePart } from '../reader-page.ts';

const END_WIDTH = 96;
const END_HEIGHT = 20;
const END_GAP = 18;

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const openEndList = (
  openEnds: readonly OpenEnd[],
  nameOf: ReadonlyMap<FunctionId, string>,
): HTMLElement => {
  const list = document.createElement('ul');
  list.className = 'open-ends';
  for (const { caller, line, expression } of openEnds) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = expression;
    item.append(`${nameOf.get(caller) ?? caller}, line ${String(line)}: `, code);
    list.append(item);
  }
  return list;
};

const rateSection = (
  { resolved, open, rate }: ResolutionRate,
  openEnds: HTMLElement,
): HTMLElement => {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Resolution rate');
  section.className = 'resolution-rate';
  const value = document.createElement('p');
  value.className = 'rate-value';
  value.textContent = `${(rate * 100).toFixed(1)}%`;
  const detail = document.createElement('p');
  detail.textContent = `${counted(resolved, 'call resolved', 'calls resolved')}, ${counted(open, 'open end', 'open ends')}. A one-of group counts as one call.`;
  section.append(value, detail, openEnds);
  return section;
};

const openEndStyle = (colours: Colours): StylesheetJson => [
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
  {
    selector: 'edge.one-of',
    style: {
      'line-style': 'dotted',
      label: 'data(label)',
      'font-size': 10,
      color: colours.muted,
      'text-background-color': colours.paper,
      'text-background-opacity': 1,
    },
  },
];

const endPosition = (caller: NodeSingular, index: number) => ({
  x: caller.position('x') + BOX_WIDTH / 2 + END_GAP + END_WIDTH / 2,
  y: caller.position('y') + index * (END_HEIGHT + 4),
});

const markOpenEnds = (graph: Core, openEnds: readonly OpenEnd[]): void => {
  const byCaller = new Map<string, OpenEnd[]>();
  for (const openEnd of openEnds) {
    byCaller.set(openEnd.caller, [...(byCaller.get(openEnd.caller) ?? []), openEnd]);
  }
  for (const [callerId, ends] of byCaller) {
    const caller = graph.getElementById(callerId);
    if (caller.empty()) continue;
    ends.forEach(({ line, expression }, index) => {
      const id = `open-end:${callerId}:${String(index)}`;
      graph.add([
        {
          group: 'nodes',
          data: { id, label: `${expression} :${String(line)}`, caller: callerId, index },
          position: endPosition(caller, index),
          classes: 'open-end',
          selectable: false,
        },
        {
          group: 'edges',
          data: { id: `${id}:arrow`, source: callerId, target: id },
          classes: 'open-end',
          selectable: false,
        },
      ]);
    });
  }
  graph.on('position', 'node.function', (event) => {
    const caller = event.target as NodeSingular;
    graph.nodes('.open-end').forEach((end) => {
      if (end.data('caller') === caller.id()) {
        end.position(endPosition(caller, end.data('index') as number));
      }
    });
  });
};

const openEnds: PagePart = ({ data, graph, panels }) => {
  const root = document.documentElement;
  const addStyle = (): void => {
    graph
      .style()
      .append(openEndStyle(coloursOf(root)))
      .update();
  };
  addStyle();
  if ('matchMedia' in window) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', addStyle);
  }

  const nameOf = new Map(data.review.functions.map(({ id, name }) => [id, name]));
  panels.prepend(
    rateSection(data.review.resolutionRate, openEndList(data.review.openEnds, nameOf)),
  );
  graph.batch(() => {
    markOpenEnds(graph, data.review.openEnds);
    for (const { id, caller, callees } of data.review.oneOfGroups) {
      for (const callee of callees) {
        graph
          .getElementById(callIdOf(caller, callee))
          .addClass('one-of')
          .data({ group: id, label: `one of ${String(callees.length)}` });
      }
    }
  });
};

export default openEnds;
