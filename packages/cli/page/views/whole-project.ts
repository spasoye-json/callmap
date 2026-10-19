import { pageFunctionsOf } from '../functions.ts';
import { levelsOf } from '../levels.ts';
import type { View } from '../view.ts';

export const wholeProjectView: View = {
  name: 'Whole project',
  laidOutByCommand: true,
  firstChoice: (data) => ({ kind: 'level', path: levelsOf(data).top }),
  sceneOf: (data, _opened, choice) => {
    const levels = levelsOf(data);
    return levels.sceneOf(choice?.kind === 'level' ? choice.path : levels.top);
  },
  choiceShowing: (data, id) => {
    const file = pageFunctionsOf(data).get(id)?.file;
    const levels = levelsOf(data);
    return { kind: 'level', path: file === undefined ? levels.top : levels.levelHolding(file) };
  },
};
