import type { FunctionId } from '@archmap/graph-document';
import type { ReaderPageData } from './data.ts';
import { drawingOf } from './drawing.ts';
import { layoutOf } from './layout.ts';
import type { ReaderPage } from './reader-page.ts';
import type { FunctionBox, Scene } from './scene.ts';
import type { View } from './view.ts';

export interface Interaction {
  readonly page: ReaderPage;
  readonly render: () => Promise<void>;
}

export const interactionOf = (
  data: ReaderPageData,
  graph: HTMLElement,
  panels: HTMLElement,
  view: View,
): Interaction => {
  const drawing = drawingOf(graph);
  const opened = new Set<FunctionId>();
  const handlers: ((box: FunctionBox) => void)[] = [];
  let scene: Scene = { frames: [], boxes: [], lines: [] };
  let queue = Promise.resolve();
  let pending = 0;

  const functionBoxOf = (id: FunctionId): FunctionBox | undefined =>
    scene.boxes.find((box): box is FunctionBox => box.kind === 'function' && box.id === id);

  const render = (anchor?: FunctionId): Promise<void> => {
    scene = view.sceneOf(data, opened);
    const laying = layoutOf(scene);
    pending += 1;
    graph.setAttribute('aria-busy', 'true');
    const drawn = queue
      .then(() => laying)
      .then((laid) => {
        drawing.draw(laid, anchor);
      })
      .finally(() => {
        pending -= 1;
        if (pending === 0) graph.setAttribute('aria-busy', 'false');
      });
    queue = drawn.catch(() => undefined);
    return drawn;
  };

  const choose = (box: FunctionBox): void => {
    drawing.select(box.id);
    for (const handler of handlers) handler(box);
  };
  drawing.onBoxClick(choose);

  const show = (ids: readonly FunctionId[], anchor?: FunctionId): Promise<void> => {
    const fresh = ids.filter((id) => !opened.has(id) && functionBoxOf(id) === undefined);
    if (fresh.length === 0) return queue;
    for (const id of fresh) opened.add(id);
    return render(anchor);
  };

  const open = async (id: FunctionId): Promise<void> => {
    await show([id]);
    const box = functionBoxOf(id);
    if (box === undefined) return;
    drawing.focus(id);
    choose(box);
  };

  const page: ReaderPage = {
    data,
    graph,
    panels,
    onBoxClick: (handler) => {
      handlers.push(handler);
    },
    show,
    open,
  };
  return { page, render: () => render() };
};
