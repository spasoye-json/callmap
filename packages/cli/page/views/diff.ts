import type { MarkedCall, MarkedFunction } from '@archmap/review';
import { callKeyOf, sceneOf } from '../scene.ts';
import type { View } from '../view.ts';

export const diffView: View = {
  name: 'Diff',
  sceneOf: (data, opened) => {
    const { review, branchGraph } = data;
    const functions = new Map<string, MarkedFunction>(
      review.functions.map((marked) => [marked.id, marked]),
    );
    for (const graphFunction of branchGraph.functions) {
      if (opened.has(graphFunction.id) && !functions.has(graphFunction.id)) {
        functions.set(graphFunction.id, { ...graphFunction, mark: 'neighbour' });
      }
    }
    const calls = new Map<string, MarkedCall>(review.calls.map((call) => [callKeyOf(call), call]));
    for (const { caller, callee } of branchGraph.calls) {
      const key = callKeyOf({ caller, callee });
      if (calls.has(key) || !functions.has(caller) || !functions.has(callee)) continue;
      calls.set(key, { caller, callee, mark: 'kept' });
    }
    return sceneOf(data, [...functions.values()], [...calls.values()]);
  },
};
