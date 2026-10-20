export interface TabBar {
  readonly select: (name: string) => void;
}

const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

export interface TabName {
  readonly name: string;
  readonly count?: { readonly count: number; readonly words: string } | undefined;
}

const tabOf = ({ name, count }: TabName, controls: string): HTMLButtonElement => {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', controls);
  tab.textContent = name;
  if (count !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'count';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = count.count.toLocaleString('en-US');
    tab.append(badge);
    tab.title = count.words;
  }
  return tab;
};

export const tabBarOf = (
  container: HTMLElement,
  tabNames: readonly TabName[],
  controls: string,
  showView: (name: string) => void,
): TabBar => {
  const names = tabNames.map(({ name }) => name);
  const tabs = tabNames.map((tabName) => tabOf(tabName, controls));
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
