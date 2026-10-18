import type { FunctionId, GraphFunction } from '@archmap/graph-document';
import { arrowOf, boxOf, callIdOf, frameIdOf, frameOf } from './elements.ts';
import { layoutOf } from './layout.ts';
import type { ReaderPage } from './reader-page.ts';

export interface HopOpener {
  readonly show: (ids: readonly FunctionId[]) => void;
  readonly openHop: (id: FunctionId) => void;
}

const relayout = ({ graph }: ReaderPage): void => {
  const boxes = graph.nodes('.function');
  const positions = layoutOf(
    boxes.map((box) => ({
      id: box.id(),
      file: box.data('file') as string,
      firstLine: box.data('firstLine') as number,
    })),
    graph.edges().map((arrow) => ({ caller: arrow.source().id(), callee: arrow.target().id() })),
  );
  boxes.forEach((box) => {
    const position = positions.get(box.id());
    if (position !== undefined) box.position({ ...position });
  });
};

export const hopOpenerOf = (page: ReaderPage): HopOpener => {
  const { data, graph } = page;
  const functions = new Map(
    data.graph.functions.map((graphFunction) => [graphFunction.id, graphFunction]),
  );
  const neighbours = new Map<FunctionId, FunctionId[]>();
  for (const { caller, callee } of data.graph.calls) {
    neighbours.set(caller, [...(neighbours.get(caller) ?? []), callee]);
    neighbours.set(callee, [...(neighbours.get(callee) ?? []), caller]);
  }

  const show = (ids: readonly FunctionId[]): void => {
    const fresh = [...new Set(ids)]
      .filter((id) => graph.getElementById(id).empty())
      .flatMap((id): GraphFunction[] => {
        const graphFunction = functions.get(id);
        return graphFunction === undefined ? [] : [graphFunction];
      });
    if (fresh.length === 0) return;
    const freshIds = new Set(fresh.map(({ id }) => id));
    graph.batch(() => {
      for (const file of new Set(fresh.map(({ file }) => file))) {
        if (graph.getElementById(frameIdOf(file)).empty()) graph.add(frameOf(file));
      }
      graph.add(fresh.map((graphFunction) => boxOf(graphFunction, 'neighbour', { x: 0, y: 0 })));
      for (const { caller, callee } of data.graph.calls) {
        if (!freshIds.has(caller) && !freshIds.has(callee)) continue;
        if (graph.getElementById(caller).empty() || graph.getElementById(callee).empty()) continue;
        if (graph.getElementById(callIdOf(caller, callee)).nonempty()) continue;
        graph.add(arrowOf(caller, callee, 'kept'));
      }
      relayout(page);
    });
  };

  const openHop = (id: FunctionId): void => {
    show([id, ...(neighbours.get(id) ?? [])]);
  };

  return { show, openHop };
};
