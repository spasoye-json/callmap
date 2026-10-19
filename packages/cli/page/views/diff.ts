import { markedCallsOf, pageFunctionsOf } from '../functions.ts';
import { sceneOf } from '../scene.ts';
import type { View } from '../view.ts';

export const diffView: View = {
  name: 'Diff',
  sceneOf: (data, opened) => {
    const functions = pageFunctionsOf(data);
    const shown = new Set([...data.review.functions.map(({ id }) => id), ...opened]);
    return sceneOf(
      data,
      [...shown].flatMap((id) => functions.get(id) ?? []),
      markedCallsOf(data).filter(({ caller, callee }) => shown.has(caller) && shown.has(callee)),
    );
  },
};
