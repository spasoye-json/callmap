import { callTreeOf, entryPointsOf } from '@archmap/review';
import type { EntryPoint } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { markedCallsOf, pageFunctionsOf } from '../functions.ts';
import { sceneOf } from '../scene.ts';
import type { View } from '../view.ts';

export const routeEntryPointsOf = ({
  review,
  branchGraph,
}: ReaderPageData): readonly EntryPoint[] =>
  entryPointsOf(
    branchGraph,
    new Set(review.functions.filter(({ mark }) => mark !== 'neighbour').map(({ id }) => id)),
  );

export const routeView: View = {
  name: 'Route',
  sceneOf: (data, _opened, choice) => {
    const from = choice?.kind === 'tree' ? choice.from : routeEntryPointsOf(data)[0]?.id;
    if (from === undefined) return sceneOf(data, [], []);
    const functions = pageFunctionsOf(data);
    const tree = new Set(callTreeOf(data.branchGraph, from));
    const calls = markedCallsOf(data).filter(
      ({ caller, callee }) => tree.has(caller) && tree.has(callee),
    );
    return sceneOf(
      data,
      [...tree].flatMap((id) => functions.get(id) ?? []),
      calls,
    );
  },
  choiceShowing: (data, id) => {
    const reaching = new Set(
      entryPointsOf(data.branchGraph, new Set([id]))
        .filter(({ reachesChange }) => reachesChange)
        .map((entry) => entry.id),
    );
    const entry = routeEntryPointsOf(data).find((candidate) => reaching.has(candidate.id));
    return { kind: 'tree', from: entry?.id ?? id };
  },
};
