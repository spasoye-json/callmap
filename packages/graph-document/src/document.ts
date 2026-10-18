import {
  GraphDocumentError,
  requireArray,
  requireFields,
  requireLine,
  requireNonEmpty,
  requirePath,
} from './contract.ts';

export type FunctionId = string;

export interface GraphFunction {
  readonly id: FunctionId;
  readonly name: string;
  readonly file: string;
  readonly firstLine: number;
  readonly lastLine: number;
  readonly sourceHash: string;
}

export interface Call {
  readonly caller: FunctionId;
  readonly callee: FunctionId;
  readonly line: number;
}

export interface OpenEnd {
  readonly caller: FunctionId;
  readonly line: number;
  readonly expression: string;
}

export interface GraphDocument {
  readonly language: string;
  readonly scope: readonly string[];
  readonly files: readonly string[];
  readonly functions: readonly GraphFunction[];
  readonly calls: readonly Call[];
  readonly openEnds: readonly OpenEnd[];
}

const DOCUMENT_FIELDS: readonly string[] = [
  'language',
  'scope',
  'files',
  'functions',
  'calls',
  'openEnds',
];
const FUNCTION_FIELDS: readonly string[] = [
  'id',
  'name',
  'file',
  'firstLine',
  'lastLine',
  'sourceHash',
];
const CALL_FIELDS: readonly string[] = ['caller', 'callee', 'line'];
const OPEN_END_FIELDS: readonly string[] = ['caller', 'line', 'expression'];

const WHAT = 'a graph document';

const readFunction = (entry: unknown): GraphFunction => {
  const fields = requireFields(entry, 'a function', FUNCTION_FIELDS);
  return {
    id: requireNonEmpty(fields['id'], 'the id of a function'),
    name: requireNonEmpty(fields['name'], 'the name of a function'),
    file: requirePath(fields['file'], 'the file of a function'),
    firstLine: requireLine(fields['firstLine'], 'the first line of a function'),
    lastLine: requireLine(fields['lastLine'], 'the last line of a function'),
    sourceHash: requireNonEmpty(fields['sourceHash'], 'the source hash of a function'),
  };
};

const readCall = (entry: unknown): Call => {
  const fields = requireFields(entry, 'a call', CALL_FIELDS);
  return {
    caller: requireNonEmpty(fields['caller'], 'the caller of a call'),
    callee: requireNonEmpty(fields['callee'], 'the callee of a call'),
    line: requireLine(fields['line'], 'the line of a call'),
  };
};

const readOpenEnd = (entry: unknown): OpenEnd => {
  const fields = requireFields(entry, 'an open end', OPEN_END_FIELDS);
  return {
    caller: requireNonEmpty(fields['caller'], 'the caller of an open end'),
    line: requireLine(fields['line'], 'the line of an open end'),
    expression: requireNonEmpty(fields['expression'], 'the expression of an open end'),
  };
};

export const readGraphDocument = (value: unknown): GraphDocument => {
  const fields = requireFields(value, WHAT, DOCUMENT_FIELDS);
  const language = requireNonEmpty(fields['language'], `the language tag of ${WHAT}`);
  const scope = requireArray(fields, 'scope', WHAT).map((glob) =>
    requireNonEmpty(glob, 'a scope glob'),
  );
  const files = requireArray(fields, 'files', WHAT).map((path) => requirePath(path, 'a file path'));
  const functions = requireArray(fields, 'functions', WHAT).map(readFunction);
  const calls = requireArray(fields, 'calls', WHAT).map(readCall);
  const openEnds = requireArray(fields, 'openEnds', WHAT).map(readOpenEnd);

  const claimed = new Set(files);
  const known = new Set<FunctionId>();
  for (const graphFunction of functions) {
    if (known.has(graphFunction.id)) {
      throw new GraphDocumentError(`two functions carry the id '${graphFunction.id}'`);
    }
    if (!claimed.has(graphFunction.file)) {
      throw new GraphDocumentError(
        `the function '${graphFunction.id}' sits in '${graphFunction.file}', which the document does not claim`,
      );
    }
    if (graphFunction.lastLine < graphFunction.firstLine) {
      throw new GraphDocumentError(
        `the last line of the function '${graphFunction.id}' comes before its first line`,
      );
    }
    known.add(graphFunction.id);
  }

  const requireKnown = (id: FunctionId, what: string): void => {
    if (!known.has(id)) {
      throw new GraphDocumentError(
        `${what} names '${id}', which is not a function of the document`,
      );
    }
  };
  for (const call of calls) {
    requireKnown(call.caller, 'the caller of a call');
    requireKnown(call.callee, 'the callee of a call');
  }
  for (const openEnd of openEnds) requireKnown(openEnd.caller, 'the caller of an open end');

  return { language, scope, files, functions, calls, openEnds };
};
