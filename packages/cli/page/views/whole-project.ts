import { pageFunctionsOf } from '../functions.ts';
import { levelsOf } from '../levels.ts';
import type { View } from '../view.ts';

export const wholeProjectView: View = {
  name: 'Whole project',
  laidOutByCommand: true,
  firstChoice: (data) => ({ kind: 'level', path: levelsOf(data).top }),
  sceneOf: (data, _opened, choice) => {
    const levels = levelsOf(data);
    return {
      ...levels.sceneOf(choice?.kind === 'level' ? choice.path : levels.top),
      modelOrder: 'NONE',
    };
  },
  choiceShowing: (data, id) => {
    const file = pageFunctionsOf(data).get(id)?.file;
    return { kind: 'level', path: file ?? levelsOf(data).top };
  },
};
