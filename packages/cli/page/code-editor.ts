import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from '@codemirror/lang-javascript';
import { HighlightStyle, LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import type { LRLanguage } from '@codemirror/language';
import { getChunks, getOriginalDoc, unifiedMergeView } from '@codemirror/merge';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  lineNumberWidgetMarker,
  lineNumbers,
} from '@codemirror/view';
import type { BlockInfo, DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { FunctionCode } from './functions.ts';

const LANGUAGES: readonly (readonly [RegExp, LRLanguage])[] = [
  [/\.[cm]?ts$/, typescriptLanguage],
  [/\.tsx$/, tsxLanguage],
  [/\.jsx$/, jsxLanguage],
  [/\.[cm]?js$/, javascriptLanguage],
];

const languageOf = (file: string): Extension => {
  const found = LANGUAGES.find(([pattern]) => pattern.test(file));
  return found === undefined ? [] : new LanguageSupport(found[1]);
};

const syntax = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], class: 'syntax-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'syntax-string' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'syntax-literal' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'syntax-comment' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'syntax-type' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: 'syntax-function',
  },
  {
    tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)],
    class: 'syntax-definition',
  },
]);

const fileLineNumbers = (firstLine: number): Extension =>
  lineNumbers({ formatNumber: (number) => String(number + firstLine - 1) });

class RemovedLineNumbers extends GutterMarker {
  readonly numbers: readonly number[];

  constructor(numbers: readonly number[]) {
    super();
    this.numbers = numbers;
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof RemovedLineNumbers && other.numbers.join() === this.numbers.join();
  }

  override toDOM(): Node {
    const column = document.createElement('div');
    column.className = 'removed-line-numbers';
    for (const number of this.numbers) {
      const line = document.createElement('div');
      line.textContent = String(number);
      column.append(line);
    }
    return column;
  }
}

const removedLineNumbers = (firstLine: number): Extension =>
  lineNumberWidgetMarker.of((view: EditorView, _widget, block: BlockInfo) => {
    const chunk = getChunks(view.state)?.chunks.find(
      ({ fromB, fromA, toA }) => fromB === block.from && fromA < toA,
    );
    if (chunk === undefined) return null;
    const original = getOriginalDoc(view.state);
    const first = original.lineAt(chunk.fromA).number;
    const last = original.lineAt(Math.max(chunk.fromA, chunk.toA - 1)).number;
    return new RemovedLineNumbers(
      Array.from({ length: last - first + 1 }, (_, index) => first + index + firstLine - 1),
    );
  });

const everyLine = (line: Decoration, text: Decoration): Extension =>
  EditorView.decorations.compute([], (state) => {
    const builder = new RangeSetBuilder<Decoration>();
    for (let number = 1; number <= state.doc.lines; number += 1) {
      const { from, to } = state.doc.line(number);
      builder.add(from, from, line);
      if (to > from) builder.add(from, to, text);
    }
    return builder.finish();
  });

const everyLineAdded = everyLine(
  Decoration.line({ class: 'cm-changedLine' }),
  Decoration.mark({ tagName: 'ins', class: 'cm-insertedLine' }),
);

const everyLineRemoved = everyLine(
  Decoration.line({ class: 'cm-deletedLine' }),
  Decoration.mark({ tagName: 'del' }),
);

const addedOnlyLine = Decoration.line({ class: 'added-only' });

const addedOnlyLinesOf = (state: EditorState): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { fromA, toA, fromB, toB } of getChunks(state)?.chunks ?? []) {
    if (fromA < toA || fromB >= toB) continue;
    const last = state.doc.lineAt(Math.max(fromB, toB - 1)).number;
    for (let number = state.doc.lineAt(fromB).number; number <= last; number += 1) {
      const { from } = state.doc.line(number);
      builder.add(from, from, addedOnlyLine);
    }
  }
  return builder.finish();
};

const addedOnlyLines = ViewPlugin.define(
  (view) => ({ decorations: addedOnlyLinesOf(view.state) }),
  { decorations: ({ decorations }) => decorations },
);

const readOnly: Extension = [EditorState.readOnly.of(true), EditorView.editable.of(false)];

const extensionsOf = (code: FunctionCode): Extension => {
  switch (code.kind) {
    case 'kept':
      return fileLineNumbers(code.code.firstLine);
    case 'added':
      return [fileLineNumbers(code.code.firstLine), everyLineAdded];
    case 'removed':
      return [fileLineNumbers(code.code.firstLine), everyLineRemoved];
    case 'diff':
      return [
        fileLineNumbers(code.branch.firstLine),
        unifiedMergeView({ original: code.base.text, mergeControls: false, gutter: false }),
        removedLineNumbers(code.base.firstLine),
        addedOnlyLines,
      ];
  }
};

export const codeEditorOf = (file: string, code: FunctionCode): EditorView =>
  new EditorView({
    doc: code.kind === 'diff' ? code.branch.text : code.code.text,
    extensions: [readOnly, languageOf(file), syntaxHighlighting(syntax), extensionsOf(code)],
  });
