import { svgOf } from './svg.ts';

export interface EmptyState {
  readonly name: string;
  readonly title: string;
  readonly line: string;
  readonly action: string;
  readonly act: () => void;
  readonly icon: readonly SVGElement[];
}

export const emptyStateOf = ({ name, title, line, action, act, icon }: EmptyState): HTMLElement => {
  const titleId = `${name}-title`;
  const state = document.createElement('section');
  state.className = `empty-state ${name}`;
  state.setAttribute('role', 'status');
  state.setAttribute('aria-labelledby', titleId);
  const heading = document.createElement('h2');
  heading.id = titleId;
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = line;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = action;
  button.addEventListener('click', act);
  state.append(
    svgOf(
      'svg',
      {
        class: 'empty-state-icon',
        width: 28,
        height: 28,
        viewBox: '0 0 28 28',
        'aria-hidden': 'true',
      },
      ...icon,
    ),
    heading,
    text,
    button,
  );
  return state;
};
