import { markedCallsOf, pageFunctionsOf } from '../functions.ts';
import { nestedSceneOf } from '../nested-scene.ts';
import type { View } from '../view.ts';

export const wholeProjectView: View = {
  name: 'Whole project',
  zoomLevels: true,
  sceneOf: (data) => {
    const functions = pageFunctionsOf(data);
    const calls = markedCallsOf(data).filter(
      ({ caller, callee }) => functions.has(caller) && functions.has(callee),
    );
    return nestedSceneOf(data, [...functions.values()], calls);
  },
};
