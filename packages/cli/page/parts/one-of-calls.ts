import type { EdgeSingular } from 'cytoscape';
import type { Call } from '@archmap/graph-document';
import { appendTo } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { callIdOf } from '../elements.ts';
import type { GraphStyle, PagePart } from '../reader-page.ts';

const oneOfStyle: GraphStyle = (colours) => [
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

interface OneOfLabel {
  readonly group: string;
  readonly label: string;
}

type GroupCall = Pick<Call, 'caller' | 'callee'> & { readonly group: string };

const oneOfLabelsOf = ({
  review,
  branchGraph,
}: ReaderPageData): ReadonlyMap<string, OneOfLabel> => {
  const reviewed = new Set(review.functions.map(({ id }) => id));
  const groups = new Map<string, GroupCall[]>();
  const add = (call: GroupCall): void => {
    appendTo(groups, `${call.caller} ${call.group}`, call);
  };
  for (const { id, caller, callees } of review.oneOfGroups) {
    for (const callee of callees) add({ group: id, caller, callee });
  }
  for (const { group, caller, callee } of branchGraph.calls) {
    if (group !== undefined && !reviewed.has(caller)) add({ group, caller, callee });
  }
  return new Map(
    [...groups.values()].flatMap((calls) =>
      calls.map(({ group, caller, callee }): [string, OneOfLabel] => [
        callIdOf(caller, callee),
        { group, label: `one of ${String(calls.length)}` },
      ]),
    ),
  );
};

const oneOfCalls: PagePart = ({ data, graph, addGraphStyle }) => {
  addGraphStyle(oneOfStyle);
  const labels = oneOfLabelsOf(data);

  const markOneOf = (arrow: EdgeSingular): void => {
    const label = labels.get(arrow.id());
    if (label !== undefined) arrow.addClass('one-of').data(label);
  };

  graph.batch(() => {
    graph.edges('.call').forEach(markOneOf);
  });
  graph.on('add', 'edge.call', (event) => {
    markOneOf(event.target as EdgeSingular);
  });
};

export default oneOfCalls;
