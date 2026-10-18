import { describe, expect, it } from 'vitest';
import type { Call, GraphDocument, GraphFunction, OpenEnd } from '@archmap/graph-document';
import { reviewOf } from '../src/index.ts';

const fn = (id: string, sourceHash = `${id}@1`): GraphFunction => {
  const [file = '', name = ''] = id.split('#');
  return { id, name, file, firstLine: 1, lastLine: 3, sourceHash };
};

const call = (caller: string, callee: string, line = 2): Call => ({ caller, callee, line });

const oneOf = (caller: string, callee: string, group: string, line = 4): Call => ({
  caller,
  callee,
  line,
  group,
});

const openEnd = (caller: string, expression: string, line = 5): OpenEnd => ({
  caller,
  line,
  expression,
});

const graph = (
  functions: readonly GraphFunction[],
  calls: readonly Call[] = [],
  openEnds: readonly OpenEnd[] = [],
): GraphDocument => ({
  language: 'example',
  scope: [],
  files: [...new Set(functions.map(({ file }) => file))],
  functions,
  calls,
  openEnds,
});

const A = 'src/a.ts#a';
const B = 'src/a.ts#b';
const C = 'src/c.ts#c';
const D = 'src/d.ts#d';

const rateOf = (branch: GraphDocument, base: GraphDocument = graph([])) =>
  reviewOf({ base, branch }).resolutionRate;

describe('the resolution rate of a review', () => {
  it('divides the calls of the branch graph by those calls plus its open ends', () => {
    const branch = graph(
      [fn(A), fn(B), fn(C)],
      [call(A, B), call(A, C), call(B, C)],
      [openEnd(A, 'bcrypt.hash')],
    );
    expect(rateOf(branch)).toEqual({ resolved: 3, open: 1, rate: 0.75 });
  });

  it('counts a one-of group as one resolved call', () => {
    const branch = graph(
      [fn(A), fn(B), fn(C)],
      [call(A, B), oneOf(A, B, 'g'), oneOf(A, C, 'g')],
      [openEnd(B, 'hook')],
    );
    expect(rateOf(branch)).toEqual({ resolved: 2, open: 1, rate: 2 / 3 });
  });

  it('reads the rate from the branch graph, not the base graph', () => {
    const base = graph([fn(A), fn(B)], [], [openEnd(A, 'x'), openEnd(B, 'y')]);
    const branch = graph([fn(A), fn(B)], [call(A, B)]);
    expect(rateOf(branch, base)).toEqual({ resolved: 1, open: 0, rate: 1 });
  });

  it('gives a rate of one to a graph with no call to resolve, because nothing is unproven', () => {
    expect(rateOf(graph([fn(A)]))).toEqual({ resolved: 0, open: 0, rate: 1 });
  });
});

describe('the open ends of a review', () => {
  it('lists the open ends of each function the review shows, from the graph that holds it', () => {
    const base = graph([fn(A, 'old'), fn(B), fn(D)], [], [openEnd(B, 'legacy.run', 3)]);
    const branch = graph(
      [fn(A, 'new'), fn(C), fn(D)],
      [],
      [openEnd(A, 'JSON.parse(raw).notify', 7), openEnd(D, 'hook', 9)],
    );
    expect(reviewOf({ base, branch }).openEnds).toEqual([
      { caller: A, line: 7, expression: 'JSON.parse(raw).notify' },
      { caller: B, line: 3, expression: 'legacy.run' },
    ]);
  });
});

describe('the one-of groups of a review', () => {
  it('lists each one-of group of a function the review shows, with its call site and callees', () => {
    const base = graph([fn(B), fn(C), fn(D)]);
    const branch = graph(
      [fn(A), fn(B), fn(C), fn(D)],
      [oneOf(A, B, 'src/a.ts:4:3'), oneOf(A, C, 'src/a.ts:4:3'), oneOf(D, B, 'src/d.ts:2:1')],
    );
    expect(reviewOf({ base, branch }).oneOfGroups).toEqual([
      { id: 'src/a.ts:4:3', caller: A, line: 4, callees: [B, C] },
    ]);
  });

  it('marks the calls of a one-of group as calls the branch added, like any other call', () => {
    const base = graph([fn(B), fn(C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [oneOf(A, B, 'g'), oneOf(A, C, 'g')]);
    expect(reviewOf({ base, branch }).calls).toEqual([
      { caller: A, callee: B, mark: 'added' },
      { caller: A, callee: C, mark: 'added' },
    ]);
  });
});
