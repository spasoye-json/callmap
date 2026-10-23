import type { FunctionId } from '@callmap/graph-document';
import type { FunctionMark } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { drawingOf } from './drawing.ts';
import { laidOf, layoutOf } from './layout.ts';
import type { Laid, LaidFunction, Rect } from './layout.ts';
import type { ReaderPage } from './reader-page.ts';
import { isHiddenBy } from './scene.ts';
import type { FunctionBox, Scene } from './scene.ts';
import { tabBarOf } from './tabs.ts';
import { choiceKeyOf, overLimitOf } from './view.ts';
import type { Choice, OverLimit, View } from './view.ts';

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

const middleOf = ({ y, height }: Rect): number => y + height / 2;

const nextAlongCalls = (
  { boxes, lines }: Laid,
  from: string,
  along: 'callers' | 'callees',
  hidden: ReadonlySet<FunctionMark>,
): LaidFunction | undefined => {
  const start = boxes.find(({ id }) => id === from);
  if (start === undefined) return undefined;
  const ends = new Set(
    lines.flatMap((line) => {
      if (along === 'callees') return line.from === from ? [line.to] : [];
      return line.to === from ? [line.from] : [];
    }),
  );
  const distanceOf = (box: Rect): number => Math.abs(middleOf(box) - middleOf(start));
  return boxes
    .filter(
      (box): box is LaidFunction =>
        box.kind === 'function' && ends.has(box.id) && !isHiddenBy(hidden, box),
    )
    .sort((left, right) => distanceOf(left) - distanceOf(right) || left.x - right.x)[0];
};

export const interactionOf = (
  data: ReaderPageData,
  { graph, panels, tabs }: PageElements,
  views: readonly [View, ...View[]],
): Interaction => {
  const drawing = drawingOf(graph);
  const boxHandlers: ((box: FunctionBox) => void)[] = [];
  const viewHandlers: ((view: View) => void)[] = [];
  const choiceHandlers: ((view: View, choice: Choice) => void)[] = [];
  const overLimitHandlers: ((over: OverLimit | undefined) => void)[] = [];
  const hiddenMarkHandlers: ((hidden: ReadonlySet<FunctionMark>) => void)[] = [];
  const hiddenMarks = new Set<FunctionMark>();
  const overviewMapHandlers: ((collapsed: boolean) => void)[] = [];
  let overviewMapCollapsed = false;
  const states = views.map((view): ViewState => ({
    view,
    opened: new Set(),
    choice: view.firstChoice?.(data),
    scene: undefined,
    laid: undefined,
    kept: new Map(),
  })) as [ViewState, ...ViewState[]];
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

  const sceneOf = (target: ViewState): Scene => {
    target.scene ??= target.view.sceneOf(data, target.opened, target.choice);
    return target.scene;
  };

  const overLimitAt = (target: ViewState): OverLimit | undefined =>
    overLimitOf(target.view, data, sceneOf(target));

  let current = states.find((state) => overLimitAt(state) === undefined) ?? states[0];

  const tellOverLimit = (over: OverLimit | undefined): void => {
    for (const handler of overLimitHandlers) handler(over);
  };

  const paint = (target: ViewState, laid: Laid, anchor?: FunctionId): void => {
    if (target !== current) return;
    tellOverLimit(undefined);
    drawing.draw(laid, anchor);
    hovered = undefined;
    drawing.highlight(selected, hovered);
    if (drawn !== target) drawing.camera.open(selected);
    drawn = target;
  };

  const leaveUndrawn = (target: ViewState, over: OverLimit): void => {
    if (target !== current) return;
    drawn = undefined;
    tellOverLimit(over);
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
    const over = overLimitAt(target);
    if (over !== undefined) {
      target.laid = undefined;
      return queued(() => {
        leaveUndrawn(target, over);
        return Promise.resolve();
      });
    }
    const layout = layoutFor(target, sceneOf(target));
    target.laid = layout;
    return queued(async () => {
      paint(target, await layout, anchor);
    });
  };

  const highlight = (id: FunctionId | undefined): void => {
    selected = id;
    drawing.highlight(selected, hovered);
  };

  drawing.onBoxHover((id) => {
    if (id === hovered) return;
    hovered = id;
    drawing.highlight(selected, hovered);
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
  const step = (along: 'callers' | 'callees'): void => {
    if (selected === undefined) return;
    const next = nextAlongCalls(drawing.level(), selected, along, hiddenMarks);
    if (next === undefined) return;
    select(next);
    drawing.camera.keepInView(next.id);
    graph.querySelector<SVGElement>(`[data-box="${CSS.escape(next.id)}"]`)?.focus();
  };
  const graphKeys: Readonly<Record<string, () => void>> = {
    f: drawing.camera.fit,
    F: drawing.camera.fit,
    0: drawing.camera.reset,
    ArrowLeft: () => {
      step('callers');
    },
    ArrowRight: () => {
      step('callees');
    },
  };
  const isOnDrawing = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('svg.drawing') !== null;
  graph.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !isOnDrawing(event.target)) return;
    const act = graphKeys[event.key];
    if (act === undefined) return;
    event.preventDefault();
    act();
  });

  const toggleMark = (mark: FunctionMark): void => {
    if (hiddenMarks.has(mark)) hiddenMarks.delete(mark);
    else hiddenMarks.add(mark);
    for (const handler of hiddenMarkHandlers) handler(hiddenMarks);
  };

  const keepSelectionInView = (): void => {
    if (selected !== undefined) drawing.camera.keepInView(selected);
  };

  const toggleOverviewMap = (): void => {
    overviewMapCollapsed = !overviewMapCollapsed;
    // The CSS reads this attribute, so the map and the zoom controls move before any handler measures them.
    graph.toggleAttribute('data-overview-map-collapsed', overviewMapCollapsed);
    for (const handler of overviewMapHandlers) handler(overviewMapCollapsed);
    if (!overviewMapCollapsed) keepSelectionInView();
  };

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
    drawing.camera.focus(id);
    select(box);
  };

  const showView = (name: string): Promise<void> => {
    const target = states.find(({ view }) => view.name === name);
    if (target === undefined || target === current) return queue;
    current = target;
    tabBar.select(name);
    for (const handler of viewHandlers) handler(target.view);
    tellOverLimit(undefined);
    const { laid } = target;
    if (laid === undefined) return render(target);
    return queued(async () => {
      paint(target, await laid);
    });
  };

  const tabBar = tabBarOf(
    tabs,
    views.map(({ name, countOf }) => ({ name, count: countOf?.(data) })),
    graph.id,
    (name) => {
      void showView(name);
    },
  );
  tabBar.select(current.view.name);

  const page: Omit<ReaderPage, 'sources'> = {
    data,
    graph,
    camera: drawing.camera,
    level: drawing.level,
    onLevelChange: drawing.onLevelChange,
    panels,
    onBoxClick: (handler) => {
      boxHandlers.push(handler);
    },
    onLineClick: drawing.onLineClick,
    onHighlight: drawing.onHighlight,
    onViewChange: (handler) => {
      viewHandlers.push(handler);
    },
    onChoiceChange: (handler) => {
      choiceHandlers.push(handler);
    },
    currentView: () => current.view,
    onOverLimitChange: (handler) => {
      overLimitHandlers.push(handler);
    },
    hiddenMarks: () => hiddenMarks,
    toggleMark,
    onHiddenMarksChange: (handler) => {
      hiddenMarkHandlers.push(handler);
    },
    overviewMapCollapsed: () => overviewMapCollapsed,
    toggleOverviewMap,
    onOverviewMapToggle: (handler) => {
      overviewMapHandlers.push(handler);
    },
    show,
    open,
    keepSelectionInView,
    showView,
    choose,
  };
  return { page, render: () => render(current) };
};
