import { callTreeOf, entryPointsOf } from '@archmap/review';
import type { EntryPoint } from '@archmap/review';
import type { ReaderPageData } from '../data.ts';
import { markedCallsOf, markedFunctionsOf } from '../functions.ts';
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
  sceneOf: (data, _opened, chosen) => {
    const entry = chosen ?? routeEntryPointsOf(data)[0]?.id;
    if (entry === undefined) return sceneOf(data, [], []);
    const functions = markedFunctionsOf(data);
    const tree = new Set(callTreeOf(data.branchGraph, entry));
    const calls = markedCallsOf(data).filter(
      ({ caller, callee }) => tree.has(caller) && tree.has(callee),
    );
    return sceneOf(
      data,
      [...tree].flatMap((id) => functions.get(id) ?? []),
      calls,
    );
  },
};
