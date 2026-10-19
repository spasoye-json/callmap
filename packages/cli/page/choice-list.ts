import type { ReaderPage } from './reader-page.ts';
import { choiceKeyOf } from './view.ts';
import type { Choice, View } from './view.ts';

export interface ChoiceList {
  readonly buttonOf: (choice: Choice, ...content: readonly (Node | string)[]) => HTMLButtonElement;
}

export const choiceListOf = (
  page: ReaderPage,
  view: View,
  panel: HTMLElement,
  first?: Choice,
): ChoiceList => {
  const buttons = new Map<string, HTMLButtonElement>();
  let currentKey = first === undefined ? undefined : choiceKeyOf(first);
  const markCurrent = (key: string, button: HTMLButtonElement): void => {
    if (key === currentKey) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  };

  panel.hidden = true;
  page.onViewChange((shown) => {
    panel.hidden = shown !== view;
  });
  page.onChoiceChange((changed, choice) => {
    if (changed !== view) return;
    currentKey = choiceKeyOf(choice);
    buttons.forEach((button, key) => {
      markCurrent(key, button);
    });
  });

  return {
    buttonOf: (choice, ...content) => {
      const key = choiceKeyOf(choice);
      const button = document.createElement('button');
      button.type = 'button';
      button.append(...content);
      button.addEventListener('click', () => {
        void page.choose(choice);
      });
      buttons.set(key, button);
      markCurrent(key, button);
      return button;
    },
  };
};
