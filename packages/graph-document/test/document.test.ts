import { describe, expect, it } from 'vitest';
import { GraphDocumentError, readGraphDocument } from '../src/index.ts';
import type { GraphDocument, GraphFunction } from '../src/index.ts';

const CREATE = 'src/orders.ts#OrdersService.create';
const TOTAL = 'src/money.ts#total';

const total: GraphFunction = {
  id: TOTAL,
  name: 'total',
  file: 'src/money.ts',
  firstLine: 1,
  lastLine: 3,
  sourceHash: 'a1',
};

const create: GraphFunction = {
  id: CREATE,
  name: 'OrdersService.create',
  file: 'src/orders.ts',
  firstLine: 4,
  lastLine: 9,
  sourceHash: 'b2',
};

const document = (over: Partial<GraphDocument> = {}): GraphDocument => ({
  language: 'typescript',
  scope: ['src/**'],
  files: ['src/money.ts', 'src/orders.ts'],
  functions: [total, create],
  calls: [{ caller: CREATE, callee: TOTAL, line: 6 }],
  openEnds: [],
  ...over,
});

describe('readGraphDocument', () => {
  it('reads the graph document one extractor emitted', () => {
    expect(readGraphDocument(document())).toEqual(document());
  });

  it('reads an open end with its caller, its line and the text of the callee', () => {
    const openEnds = [{ caller: CREATE, line: 7, expression: 'bcrypt.hash' }];
    expect(readGraphDocument(document({ openEnds })).openEnds).toEqual(openEnds);
  });
});

describe('a graph document the contract does not allow', () => {
  const refuse = (value: unknown) => () => readGraphDocument(value);

  it('refuses a document that is not an object', () => {
    expect(refuse('functions and calls')).toThrow(GraphDocumentError);
  });

  it.each(['language', 'scope', 'files', 'functions', 'calls', 'openEnds'] as const)(
    'refuses a document that names no %s, because a field left out is not an empty one',
    (key) => {
      const { [key]: _left, ...rest } = document();
      expect(refuse(rest)).toThrow(new RegExp(key));
    },
  );

  it('refuses a field the contract does not hold', () => {
    expect(refuse({ ...document(), edges: [] })).toThrow(/edges/);
  });

  it('refuses a call to an unknown function id', () => {
    const calls = [{ caller: CREATE, callee: 'src/money.ts#round', line: 6 }];
    expect(refuse(document({ calls }))).toThrow(/src\/money\.ts#round/);
  });

  it('refuses a call from an unknown function id', () => {
    const calls = [{ caller: 'src/orders.ts#main', callee: TOTAL, line: 6 }];
    expect(refuse(document({ calls }))).toThrow(/src\/orders\.ts#main/);
  });

  it('refuses an open end from an unknown function id', () => {
    const openEnds = [{ caller: 'src/orders.ts#main', line: 2, expression: 'sharp' }];
    expect(refuse(document({ openEnds }))).toThrow(/src\/orders\.ts#main/);
  });

  it('refuses two functions with one id, because a call could not tell them apart', () => {
    expect(refuse(document({ functions: [total, total] }))).toThrow(/src\/money\.ts#total/);
  });

  it('refuses a function in a file the document does not claim', () => {
    expect(refuse(document({ files: ['src/orders.ts'] }))).toThrow(/src\/money\.ts/);
  });

  it('refuses a function that ends before it starts', () => {
    const functions = [{ ...total, firstLine: 5, lastLine: 3 }, create];
    expect(refuse(document({ functions }))).toThrow(/last line/);
  });

  it('refuses a line that is not a line number', () => {
    const calls = [{ caller: CREATE, callee: TOTAL, line: 0 }];
    expect(refuse(document({ calls }))).toThrow(GraphDocumentError);
  });

  it('refuses a function with no source hash', () => {
    const functions = [{ ...total, sourceHash: '' }, create];
    expect(refuse(document({ functions }))).toThrow(/source hash/);
  });

  it('refuses a file path that is not repo-relative', () => {
    expect(refuse(document({ files: ['/src/money.ts', 'src/orders.ts'] }))).toThrow(
      /repo-relative/,
    );
  });
});
