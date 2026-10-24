import { describe, expect, it } from 'vitest';
import type { Call, GraphDocument, GraphFunction } from '@callmap/graph-document';
import { callTreeOf, entryPointsOf } from '../src/index.ts';

const fn = (id: string): GraphFunction => {
  const [file = '', name = ''] = id.split('#');
  return { id, name, file, firstLine: 1, lastLine: 3, sourceHash: `${id}@1` };
};

const call = (caller: string, callee: string, line = 2): Call => ({ caller, callee, line });

const graph = (ids: readonly string[], calls: readonly Call[] = []): GraphDocument => {
  const functions = ids.map(fn);
  return {
    language: 'example',
    checker: { name: 'Example', version: '1.0.0' },
    scope: [],
    files: [...new Set(functions.map(({ file }) => file))],
    functions,
    calls,
    openEnds: [],
  };
};

const A = 'src/a.ts#a';
const B = 'src/a.ts#b';
const C = 'src/c.ts#c';
const D = 'src/d.ts#d';

const idsOf = (document: GraphDocument, changed?: ReadonlySet<string>) =>
  entryPointsOf(document, changed).map(({ id }) => id);

describe('the entry points of a graph document', () => {
  it('holds each function with no caller in scope, and no function with one', () => {
    expect(idsOf(graph([A, B, C], [call(A, B)]))).toEqual([A, C]);
  });

  it('holds a function that only calls itself, because no other function calls it', () => {
    expect(idsOf(graph([A, B], [call(A, A), call(A, B)]))).toEqual([A]);
  });

  it('holds no function of a cycle that no function outside it calls', () => {
    expect(idsOf(graph([A, B, C], [call(A, B), call(B, A)]))).toEqual([C]);
  });

  it('lists the entry points that reach a changed function first, then by id', () => {
    const document = graph([A, B, C, D], [call(D, C)]);
    expect(entryPointsOf(document, new Set([C]))).toEqual([
      { id: D, reachesChange: true },
      { id: A, reachesChange: false },
      { id: B, reachesChange: false },
    ]);
  });

  it('counts an entry point that the branch changed as one that reaches a change', () => {
    expect(entryPointsOf(graph([A, B]), new Set([B]))).toEqual([
      { id: B, reachesChange: true },
      { id: A, reachesChange: false },
    ]);
  });

  it('follows the calls down to the last callee, and ends at a cycle', () => {
    const document = graph([A, B, C, D], [call(D, A), call(A, B), call(B, A), call(B, C)]);
    expect(idsOf(document, new Set([C]))).toEqual([D]);
    expect(entryPointsOf(document, new Set([C]))[0]?.reachesChange).toBe(true);
  });
});

describe('the call tree of an entry point', () => {
  it('holds the entry point and every function that it reaches, down to the last callee', () => {
    const document = graph([A, B, C, D], [call(A, B), call(B, C)]);
    expect(callTreeOf(document, A)).toEqual([A, B, C]);
  });

  it('holds each function once, so a cycle ends', () => {
    const document = graph([A, B, C], [call(A, B), call(B, C), call(C, B), call(C, C)]);
    expect(callTreeOf(document, A)).toEqual([A, B, C]);
  });

  it('holds only the entry point when it calls nothing', () => {
    expect(callTreeOf(graph([A, B]), A)).toEqual([A]);
  });
});
