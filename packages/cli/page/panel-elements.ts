export const spanOf = (className: string, text: string): HTMLSpanElement => {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
};

export const eyebrowOf = (text: string, tag: 'h2' | 'p' = 'h2'): HTMLElement => {
  const eyebrow = document.createElement(tag);
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = text;
  return eyebrow;
};

export const sectionHeadOf = (title: string, aside: HTMLElement): HTMLElement => {
  const head = document.createElement('div');
  head.className = 'section-head';
  head.append(eyebrowOf(title), aside);
  return head;
};

export const moreButtonOf = (
  className: string,
  text: string,
  showMore: (button: HTMLButtonElement) => void,
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', () => {
    showMore(button);
  });
  return button;
};
