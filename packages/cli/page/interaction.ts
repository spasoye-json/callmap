import type { FunctionId } from '@callmap/graph-document';
import type { ReaderPageData } from './data.ts';
import { drawingOf } from './drawing.ts';
import { laidOf, layoutOf } from './layout.ts';
import type { Laid } from './layout.ts';
import type { ReaderPage } from './reader-page.ts';
import type { FunctionBox, Scene } from './scene.ts';
import { tabBarOf } from './tabs.ts';
import { choiceKeyOf } from './view.ts';
import type { Choice, View } from './view.ts';

export interface Interaction {
  readonly page: Omit<ReaderPage, 'sources'>;
  readonly render: () => Promise<void>;
}

export interface PageElements {
  readonly graph: HTMLElement;
  readonly panels: HTMLElement;
  readonly tabs: HTMLElement;
}

interface ViewState {
  readonly view: View;
  readonly opened: Set<FunctionId>;
  choice: Choice | undefined;
  scene: Scene | undefined;
  laid: Promise<Laid> | undefined;
  readonly kept: Map<string, Promise<Laid>>;
}

const keyOf = (choice: Choice | undefined): string =>
  choice === undefined ? '' : choiceKeyOf(choice);

export const interactionOf = (
  data: ReaderPageData,
  { graph, panels, tabs }: PageElements,
  views: readonly [View, ...View[]],
): Interaction => {
  const drawing = drawingOf(graph);
  const boxHandlers: ((box: FunctionBox) => void)[] = [];
  const viewHandlers: ((view: View) => void)[] = [];
  const choiceHandlers: ((view: View, choice: Choice) => void)[] = [];
  const states = views.map((view): ViewState => ({
    view,
    opened: new Set(),
    choice: view.firstChoice?.(data),
    scene: undefined,
    laid: undefined,
    kept: new Map(),
  })) as [ViewState, ...ViewState[]];
  let current = states[0];
  let selected: FunctionId | undefined;
  let hovered: string | undefined;
  let drawn: ViewState | undefined;
  let queue = Promise.resolve();
  let pending = 0;

  const queued = (work: () => Promise<void>): Promise<void> => {
    pending += 1;
    graph.setAttribute('aria-busy', 'true');
    const done = queue.then(work).finally(() => {
      pending -= 1;
      if (pending === 0) graph.setAttribute('aria-busy', 'false');
    });
    queue = done.catch(() => undefined);
    return done;
  };

  const paint = (target: ViewState, laid: Laid, anchor?: FunctionId): void => {
    if (target !== current) return;
    drawing.draw(laid, anchor);
    hovered = undefined;
    drawing.highlight(selected);
    if (drawn !== target) drawing.fit();
    drawn = target;
  };

  const sceneOf = (target: ViewState): Scene => {
    target.scene ??= target.view.sceneOf(data, target.opened, target.choice);
    return target.scene;
  };

  const functionBoxOf = (id: FunctionId): FunctionBox | undefined =>
    sceneOf(current).boxes.find(
      (box): box is FunctionBox => box.kind === 'function' && box.id === id,
    );

  const laidOutInPage = async ({ view, choice }: ViewState, scene: Scene): Promise<Laid> => {
    const start = performance.now();
    const laid = await layoutOf(scene);
    performance.measure(`callmap layout: ${view.name} ${keyOf(choice)}`.trim(), { start });
    return laid;
  };

  const layoutFor = (target: ViewState, scene: Scene): Promise<Laid> => {
    if (target.opened.size > 0) return laidOutInPage(target, scene);
    const key = keyOf(target.choice);
    const kept = target.kept.get(key);
    if (kept !== undefined) return kept;
    const placement =
      key === keyOf(target.view.firstChoice?.(data))
        ? data.placements[target.view.name]
        : undefined;
    const layout =
      placement === undefined
        ? laidOutInPage(target, scene)
        : Promise.resolve(laidOf(scene, placement));
    target.kept.set(key, layout);
    return layout;
  };

  const render = (target: ViewState, anchor?: FunctionId): Promise<void> => {
    target.scene = undefined;
    const layout = layoutFor(target, sceneOf(target));
    target.laid = layout;
    return queued(async () => {
      paint(target, await layout, anchor);
    });
  };

  const highlight = (id: FunctionId | undefined): void => {
    selected = id;
    drawing.highlight(hovered ?? selected);
  };

  drawing.onBoxHover((id) => {
    if (id === hovered) return;
    hovered = id;
    drawing.highlight(hovered ?? selected);
  });

  const select = (box: FunctionBox): void => {
    highlight(box.id);
    for (const handler of boxHandlers) handler(box);
  };
  drawing.onBoxClick(select);
  drawing.onLevelBoxClick(({ opens }) => {
    void choose(opens);
  });
  drawing.onEmptyClick(() => {
    highlight(undefined);
  });
  graph.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') highlight(undefined);
  });

  const show = (ids: readonly FunctionId[], anchor?: FunctionId): Promise<void> => {
    const fresh = ids.filter((id) => !current.opened.has(id) && functionBoxOf(id) === undefined);
    if (fresh.length === 0) return queue;
    for (const id of fresh) current.opened.add(id);
    return render(current, anchor);
  };

  const choose = (choice: Choice): Promise<void> => {
    current.choice = choice;
    current.opened.clear();
    drawn = undefined;
    for (const handler of choiceHandlers) handler(current.view, choice);
    return render(current);
  };

  const reveal = (id: FunctionId): Promise<void> => {
    if (functionBoxOf(id) !== undefined) return queue;
    const choice = current.view.choiceShowing?.(data, id);
    return choice === undefined ? show([id]) : choose(choice);
  };

  const open = async (id: FunctionId): Promise<void> => {
    await reveal(id);
    const box = functionBoxOf(id);
    if (box === undefined) return;
    drawing.focus(id);
    select(box);
  };

  const showView = (name: string): Promise<void> => {
    const target = states.find(({ view }) => view.name === name);
    if (target === undefined || target === current) return queue;
    current = target;
    tabBar.select(name);
    for (const handler of viewHandlers) handler(target.view);
    const { laid } = target;
    if (laid === undefined) return render(target);
    return queued(async () => {
      paint(target, await laid);
    });
  };

  const tabBar = tabBarOf(
    tabs,
    views.map(({ name }) => name),
    graph.id,
    (name) => {
      void showView(name);
    },
  );

  const page: Omit<ReaderPage, 'sources'> = {
    data,
    graph,
    panels,
    onBoxClick: (handler) => {
      boxHandlers.push(handler);
    },
    onLineClick: drawing.onLineClick,
    onViewChange: (handler) => {
      viewHandlers.push(handler);
    },
    onChoiceChange: (handler) => {
      choiceHandlers.push(handler);
    },
    currentView: () => current.view,
    show,
    open,
    keepSelectionInView: () => {
      if (selected !== undefined) drawing.keepInView(selected);
    },
    showView,
    choose,
  };
  return { page, render: () => render(current) };
};
