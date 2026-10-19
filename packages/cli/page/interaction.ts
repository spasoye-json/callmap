import type { FunctionId } from '@archmap/graph-document';
import type { ReaderPageData } from './data.ts';
import { drawingOf } from './drawing.ts';
import { layoutOf } from './layout.ts';
import type { Laid } from './layout.ts';
import type { ReaderPage } from './reader-page.ts';
import type { FunctionBox, Scene } from './scene.ts';
import { tabBarOf } from './tabs.ts';
import type { View } from './view.ts';

export interface Interaction {
  readonly page: ReaderPage;
  readonly render: () => Promise<void>;
}

export interface PageElements {
  readonly graph: HTMLElement;
  readonly panels: HTMLElement;
  readonly tabs: HTMLElement;
}

interface Shown {
  readonly view: View;
  readonly opened: Set<FunctionId>;
  choice: string | undefined;
  scene: Scene | undefined;
  laid: Promise<Laid> | undefined;
}

export const interactionOf = (
  data: ReaderPageData,
  { graph, panels, tabs }: PageElements,
  views: readonly [View, ...View[]],
): Interaction => {
  const drawing = drawingOf(graph);
  const handlers: ((box: FunctionBox) => void)[] = [];
  const viewHandlers: ((view: View) => void)[] = [];
  const shown = views.map((view): Shown => ({
    view,
    opened: new Set(),
    choice: undefined,
    scene: undefined,
    laid: undefined,
  })) as [Shown, ...Shown[]];
  let current = shown[0];
  let drawn: Shown | undefined;
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

  const paint = (target: Shown, laid: Laid, anchor?: FunctionId): void => {
    if (target !== current) return;
    drawing.draw(laid, { anchor, zoomLevels: target.view.zoomLevels === true });
    if (drawn !== target) drawing.fit();
    drawn = target;
  };

  const sceneOf = (target: Shown): Scene => {
    target.scene ??= target.view.sceneOf(data, target.opened, target.choice);
    return target.scene;
  };

  const functionBoxOf = (id: FunctionId): FunctionBox | undefined =>
    sceneOf(current).boxes.find(
      (box): box is FunctionBox => box.kind === 'function' && box.id === id,
    );

  const render = (target: Shown, anchor?: FunctionId): Promise<void> => {
    target.scene = target.view.sceneOf(data, target.opened, target.choice);
    const laying = layoutOf(target.scene);
    target.laid = laying;
    return queued(async () => {
      paint(target, await laying, anchor);
    });
  };

  const choose = (box: FunctionBox): void => {
    drawing.select(box.id);
    for (const handler of handlers) handler(box);
  };
  drawing.onBoxClick(choose);

  const show = (ids: readonly FunctionId[], anchor?: FunctionId): Promise<void> => {
    const fresh = ids.filter((id) => !current.opened.has(id) && functionBoxOf(id) === undefined);
    if (fresh.length === 0) return queue;
    for (const id of fresh) current.opened.add(id);
    return render(current, anchor);
  };

  const open = async (id: FunctionId): Promise<void> => {
    await show([id]);
    const box = functionBoxOf(id);
    if (box === undefined) return;
    drawing.focus(id);
    choose(box);
  };

  const showView = (name: string): Promise<void> => {
    const target = shown.find(({ view }) => view.name === name);
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

  const pick = (choice: string): Promise<void> => {
    current.choice = choice;
    current.opened.clear();
    drawn = undefined;
    return render(current);
  };

  const tabBar = tabBarOf(
    tabs,
    views.map(({ name }) => name),
    graph.id,
    (name) => {
      void showView(name);
    },
  );

  const page: ReaderPage = {
    data,
    graph,
    panels,
    onBoxClick: (handler) => {
      handlers.push(handler);
    },
    onLineClick: drawing.onLineClick,
    onViewChange: (handler) => {
      viewHandlers.push(handler);
    },
    show,
    open,
    showView,
    pick,
  };
  return { page, render: () => render(current) };
};
