import { byText } from '@callmap/review';
import type { FunctionMark } from '@callmap/review';
import { chipOf } from '../chips.ts';
import type { ChipMark } from '../chips.ts';
import { isChangeMark, pageFunctionsOf } from '../functions.ts';
import { moreButtonOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';
import { callKeyOf, frameIdOf } from '../scene.ts';
import type { SceneLine } from '../scene.ts';
import { countWordsOf } from '../words.ts';

const ROWS_SHOWN = 5;
const EDGE_ROOM = 8;
const FRAME_PREFIX = frameIdOf('');

const endLabelOf = (id: string): string =>
  id.startsWith(FRAME_PREFIX) ? id.slice(FRAME_PREFIX.length) : id;

interface CallRow {
  readonly call: SceneLine;
  readonly chip: ChipMark | undefined;
  readonly rank: number;
  readonly line: number | undefined;
}

const rankOf = (call: SceneLine, callerMark: FunctionMark | undefined): number => {
  if (call.mark !== 'kept') return 0;
  return isChangeMark(callerMark) ? 1 : 2;
};

const byRankThenLine = (left: CallRow, right: CallRow): number =>
  left.rank - right.rank ||
  (left.line ?? 0) - (right.line ?? 0) ||
  byText(left.call.from, right.call.from) ||
  byText(left.call.to, right.call.to);

const bundledCalls: PagePart = (page) => {
  const functions = pageFunctionsOf(page.data);
  const nameOf = (id: string): string => functions.get(id)?.name ?? id;
  const lines = new Map<string, number>();
  for (const call of page.data.branchGraph.calls) {
    const key = callKeyOf(call);
    lines.set(key, Math.min(call.line, lines.get(key) ?? call.line));
  }

  const rowOf = (call: SceneLine): CallRow => {
    const callerMark = functions.get(call.from)?.mark;
    return {
      call,
      chip: call.mark === 'kept' ? callerMark : call.mark,
      rank: rankOf(call, callerMark),
      line:
        call.mark === 'removed'
          ? undefined
          : lines.get(callKeyOf({ caller: call.from, callee: call.to })),
    };
  };

  const list = document.createElement('div');
  list.setAttribute('role', 'dialog');
  list.className = 'bundled-calls';
  list.hidden = true;
  page.graph.append(list);

  let point: { readonly x: number; readonly y: number } | undefined;
  const close = (): void => {
    list.hidden = true;
    list.replaceChildren();
  };

  const buttonOf = ({ call, chip, line }: CallRow): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bundled-call';
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    const where = document.createElement('span');
    where.className = 'call-line';
    where.textContent = line === undefined ? '' : `:${String(line)}`;
    if (chip === undefined) {
      const room = document.createElement('span');
      room.className = 'chip-room';
      button.append(room);
    } else {
      button.append(chipOf(chip));
    }
    button.append(`${nameOf(call.from)} `, arrow, ` ${nameOf(call.to)}`, where);
    button.addEventListener('click', () => {
      close();
      void page.open(call.from);
    });
    return button;
  };

  const place = (): void => {
    const width = page.graph.clientWidth;
    const height = page.graph.clientHeight;
    const { x, y } = point ?? { x: width, y: 0 };
    list.style.left = `${String(Math.max(EDGE_ROOM, Math.min(x + EDGE_ROOM, width - list.offsetWidth - EDGE_ROOM)))}px`;
    list.style.top = `${String(Math.max(EDGE_ROOM, Math.min(y + EDGE_ROOM, height - list.offsetHeight - EDGE_ROOM)))}px`;
  };

  const show = (line: SceneLine, calls: readonly SceneLine[]): void => {
    const rows = calls.map(rowOf).sort(byRankThenLine);
    const header = document.createElement('div');
    header.className = 'bundled-calls-header';
    const ends = document.createElement('span');
    ends.textContent = `${endLabelOf(line.from)} → ${endLabelOf(line.to)}`;
    const count = document.createElement('span');
    count.className = 'call-count';
    count.textContent = countWordsOf(rows.length, 'call', 'calls');
    header.append(ends, count);
    const shown = rows.slice(0, ROWS_SHOWN).map(buttonOf);
    const body = document.createElement('div');
    body.className = 'bundled-calls-rows';
    body.append(...shown);
    if (rows.length > ROWS_SHOWN) {
      body.append(
        moreButtonOf('show-all', `Show all ${String(rows.length)}`, () => {
          body.replaceChildren(...rows.map(buttonOf));
          place();
        }),
      );
    }
    list.setAttribute('aria-label', line.title ?? '');
    list.replaceChildren(header, body);
    list.hidden = false;
    place();
  };

  page.graph.addEventListener(
    'click',
    (event) => {
      const bounds = page.graph.getBoundingClientRect();
      point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (!(event.target instanceof Node && list.contains(event.target))) close();
    },
    { capture: true },
  );
  page.graph.addEventListener(
    'keydown',
    () => {
      point = undefined;
    },
    { capture: true },
  );
  page.graph.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  page.onLineClick((line) => {
    if (line.calls !== undefined) show(line, line.calls);
  });
  page.onViewChange(close);
  page.onChoiceChange(close);
};

export default bundledCalls;
