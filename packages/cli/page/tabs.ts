export interface TabBar {
  readonly select: (name: string) => void;
}

const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

const tabOf = (name: string, controls: string): HTMLButtonElement => {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', controls);
  tab.textContent = name;
  return tab;
};

export const tabBarOf = (
  container: HTMLElement,
  names: readonly string[],
  controls: string,
  showView: (name: string) => void,
): TabBar => {
  const tabs = names.map((name) => tabOf(name, controls));
  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-label', 'Views');

  const select = (name: string): void => {
    tabs.forEach((tab, index) => {
      const selected = names[index] === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      showView(names[index] ?? '');
    });
    tab.addEventListener('keydown', (event) => {
      const step = STEPS[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const next = (index + step + tabs.length) % tabs.length;
      tabs[next]?.focus();
      showView(names[next] ?? '');
    });
  });
  container.append(...tabs);
  select(names[0] ?? '');
  return { select };
};
