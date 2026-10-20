import type { FunctionId } from '@callmap/graph-document';
import { byText } from '@callmap/review';
import type { CallMark, MarkedCall } from '@callmap/review';
import { chipOf } from './chips.ts';
import type { ReaderPageData } from './data.ts';
import { markedCallsOf, pageFunctionsOf } from './functions.ts';
import type { PageFunction } from './functions.ts';
import { callKeyOf, oneOfLabelsOf, openEndsByCallerOf } from './scene.ts';

const CALL_NOTES: Readonly<Record<CallMark, string | undefined>> = {
  added: 'added call',
  removed: 'removed call',
  kept: undefined,
};

interface CallRow {
  readonly function: PageFunction;
  readonly notes: readonly string[];
}

export type CallListsOf = (id: FunctionId, select: (id: FunctionId) => void) => HTMLElement;

const spanOf = (className: string, text: string): HTMLSpanElement => {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
};

const notesOf = (notes: readonly string[]): readonly (HTMLSpanElement | string)[] =>
  notes.flatMap((note) => [' ', spanOf('note', note)]);

const functionRowOf = (row: CallRow, select: (id: FunctionId) => void): HTMLLIElement => {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'call-row';
  button.title = row.function.file;
  const { mark } = row.function;
  if (mark !== undefined) button.append(chipOf(mark));
  button.append(spanOf('name', row.function.name), ...notesOf(row.notes));
  button.addEventListener('click', () => {
    select(row.function.id);
  });
  item.append(button);
  return item;
};

const listOf = (title: string, rows: readonly HTMLLIElement[]): HTMLElement => {
  const block = document.createElement('div');
  block.className = 'call-list';
  const heading = document.createElement('p');
  heading.className = 'eyebrow';
  heading.id = `call-list-${title.replaceAll(' ', '-').toLowerCase()}`;
  heading.textContent = `${title} · ${String(rows.length)}`;
  const list = document.createElement('ul');
  list.setAttribute('aria-labelledby', heading.id);
  list.append(...rows);
  block.append(heading, list);
  return block;
};

const byName = (left: CallRow, right: CallRow): number =>
  byText(left.function.name, right.function.name) || byText(left.function.id, right.function.id);

export const callListsOf = (data: ReaderPageData): CallListsOf => {
  const functions = pageFunctionsOf(data);
  const reviewed = new Set(data.review.functions.map(({ id }) => id));
  const calls = markedCallsOf(data);
  const oneOfLabels = oneOfLabelsOf(data, reviewed);
  const openEnds = openEndsByCallerOf(data, reviewed);

  const rowOf = (call: MarkedCall, end: FunctionId): readonly CallRow[] => {
    const shown = functions.get(end);
    if (shown === undefined) return [];
    const notes = [CALL_NOTES[call.mark], oneOfLabels.get(callKeyOf(call))].filter(
      (note): note is string => note !== undefined,
    );
    return [{ function: shown, notes }];
  };

  return (id, select) => {
    const callers = calls
      .filter(({ callee }) => callee === id)
      .flatMap((call) => rowOf(call, call.caller))
      .sort(byName);
    const callees = calls
      .filter(({ caller }) => caller === id)
      .flatMap((call) => rowOf(call, call.callee))
      .sort(byName);
    const openEndRows = [...(openEnds.get(id) ?? [])]
      .sort((left, right) => left.line - right.line)
      .map(({ expression, line }) => {
        const item = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'call-row';
        row.title = `line ${String(line)}`;
        row.append(chipOf('open-end'), spanOf('name', expression), ...notesOf(['open end']));
        item.append(row);
        return item;
      });
    const lists = document.createElement('div');
    lists.className = 'call-lists';
    lists.append(
      listOf(
        'Called by',
        callers.map((row) => functionRowOf(row, select)),
      ),
      listOf('Calls', [...callees.map((row) => functionRowOf(row, select)), ...openEndRows]),
    );
    return lists;
  };
};
