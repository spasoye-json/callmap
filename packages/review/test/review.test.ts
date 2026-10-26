import { describe, expect, it } from 'vitest';
import type { Call, GraphDocument, GraphFunction } from '@callmap/graph-document';
import { reviewGraphsOf, reviewOf } from '../src/index.ts';

const fn = (id: string, sourceHash = `${id}@1`, firstLine = 1): GraphFunction => {
  const [file = '', name = ''] = id.split('#');
  return { id, name, file, firstLine, lastLine: firstLine + 2, sourceHash };
};

const call = (caller: string, callee: string, line = 2): Call => ({ caller, callee, line });

const graph = (
  functions: readonly GraphFunction[],
  calls: readonly Call[] = [],
): GraphDocument => ({
  language: 'example',
  checker: { name: 'Example', version: '1.0.0' },
  scope: [],
  files: [...new Set(functions.map(({ file }) => file))],
  functions,
  calls,
  openEnds: [],
});

const marksOf = (base: GraphDocument, branch: GraphDocument) =>
  Object.fromEntries(
    reviewOf(reviewGraphsOf({ base: [base], branch: [branch] })).functions.map(({ id, mark }) => [
      id,
      mark,
    ]),
  );

const A = 'src/a.ts#a';
const B = 'src/a.ts#b';
const C = 'src/c.ts#c';
const D = 'src/d.ts#d';

describe('the changed functions of a review', () => {
  it('marks a function that only the branch holds as added', () => {
    expect(marksOf(graph([]), graph([fn(A)]))).toEqual({ [A]: 'added' });
  });

  it('marks a function that only the base holds as removed', () => {
    expect(marksOf(graph([fn(A)]), graph([]))).toEqual({ [A]: 'removed' });
  });

  it('marks a function whose source hash differs as changed', () => {
    expect(marksOf(graph([fn(A, 'old')]), graph([fn(A, 'new')]))).toEqual({ [A]: 'changed' });
  });

  it('leaves out a function that only moved to another line, because its source is the same', () => {
    expect(marksOf(graph([fn(A, 'same', 1)]), graph([fn(A, 'same', 40)]))).toEqual({});
  });

  it('carries the place of a removed function from the base and of any other from the branch', () => {
    const review = reviewOf(
      reviewGraphsOf({
        base: [graph([fn(A, 'old', 3), fn(B, 'b', 9)])],
        branch: [graph([fn(A, 'new', 5)])],
      }),
    );
    expect(review.functions).toEqual([
      { ...fn(A, 'new', 5), mark: 'changed' },
      { ...fn(B, 'b', 9), mark: 'removed' },
    ]);
  });
});

describe('the neighbours of a review', () => {
  it('shows the callers and the callees of an added function from the branch graph', () => {
    const base = graph([fn(B), fn(C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [call(B, A), call(A, C)]);
    expect(marksOf(base, branch)).toEqual({ [A]: 'added', [B]: 'neighbour', [C]: 'neighbour' });
  });

  it('shows the callers and the callees of a changed function from the branch graph', () => {
    const base = graph([fn(A, 'old'), fn(B), fn(C), fn(D)], [call(D, A)]);
    const branch = graph([fn(A, 'new'), fn(B), fn(C), fn(D)], [call(B, A), call(A, C), call(D, A)]);
    expect(marksOf(base, branch)).toEqual({
      [A]: 'changed',
      [B]: 'neighbour',
      [C]: 'neighbour',
      [D]: 'neighbour',
    });
  });

  it('shows the callers and the callees of a removed function from the base graph', () => {
    const base = graph([fn(A), fn(B), fn(C), fn(D)], [call(B, A), call(A, C)]);
    const branch = graph([fn(B), fn(C), fn(D)], [call(D, C)]);
    expect(marksOf(base, branch)).toEqual({ [A]: 'removed', [B]: 'neighbour', [C]: 'neighbour' });
  });

  it('shows the function at the far end of a call the branch removed', () => {
    const base = graph([fn(A, 'old'), fn(B)], [call(A, B)]);
    const branch = graph([fn(A, 'new'), fn(B)]);
    expect(marksOf(base, branch)).toEqual({ [A]: 'changed', [B]: 'neighbour' });
  });

  it('marks a changed function that sits one hop from another by its change, not as a neighbour', () => {
    const base = graph([fn(A, 'old'), fn(B, 'old')], [call(A, B)]);
    const branch = graph([fn(A, 'new'), fn(B, 'new')], [call(A, B)]);
    expect(marksOf(base, branch)).toEqual({ [A]: 'changed', [B]: 'changed' });
  });

  it('shows no function two hops away', () => {
    const base = graph([fn(B), fn(C)], [call(B, C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [call(A, B), call(B, C)]);
    expect(marksOf(base, branch)).toEqual({ [A]: 'added', [B]: 'neighbour' });
  });
});

const callsOf = (base: GraphDocument, branch: GraphDocument) =>
  reviewOf(reviewGraphsOf({ base: [base], branch: [branch] })).calls;

describe('the calls of a review', () => {
  it('marks a call that only the branch holds as added', () => {
    const base = graph([fn(A, 'old'), fn(B)]);
    const branch = graph([fn(A, 'new'), fn(B)], [call(A, B)]);
    expect(callsOf(base, branch)).toEqual([{ caller: A, callee: B, mark: 'added' }]);
  });

  it('marks a call that only the base holds as removed', () => {
    const base = graph([fn(A, 'old'), fn(B)], [call(A, B)]);
    const branch = graph([fn(A, 'new'), fn(B)]);
    expect(callsOf(base, branch)).toEqual([{ caller: A, callee: B, mark: 'removed' }]);
  });

  it('marks a call that both graphs hold as kept, even when its call site moved', () => {
    const base = graph([fn(A, 'old'), fn(B)], [call(A, B, 2)]);
    const branch = graph([fn(A, 'new'), fn(B)], [call(A, B, 7)]);
    expect(callsOf(base, branch)).toEqual([{ caller: A, callee: B, mark: 'kept' }]);
  });

  it('lists one call for a caller that calls one callee from two call sites', () => {
    const base = graph([fn(B)]);
    const branch = graph([fn(A), fn(B)], [call(A, B, 2), call(A, B, 3)]);
    expect(callsOf(base, branch)).toEqual([{ caller: A, callee: B, mark: 'added' }]);
  });

  it('lists the calls between two neighbours, because the review shows both of them', () => {
    const base = graph([fn(B), fn(C)], [call(B, C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [call(B, A), call(A, C), call(B, C)]);
    expect(callsOf(base, branch)).toContainEqual({ caller: B, callee: C, mark: 'kept' });
  });

  it('leaves out a call to a function the review does not show', () => {
    const base = graph([fn(B), fn(C)], [call(B, C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [call(A, B), call(B, C)]);
    expect(callsOf(base, branch)).toEqual([{ caller: A, callee: B, mark: 'added' }]);
  });
});

describe('a review of several languages', () => {
  const inLanguage = (language: string, document: GraphDocument): GraphDocument => ({
    ...document,
    language,
    checker: { name: language, version: '1.0.0' },
  });
  const E = 'lib/e.rb#e';
  const F = 'lib/f.rb#f';

  it('reads the functions and the calls of each graph document in the list', () => {
    const review = reviewOf(
      reviewGraphsOf({
        base: [
          inLanguage('first', graph([fn(A, 'old'), fn(B)])),
          inLanguage('second', graph([fn(F)])),
        ],
        branch: [
          inLanguage('first', graph([fn(A, 'new'), fn(B)], [call(A, B)])),
          inLanguage('second', graph([fn(E), fn(F)], [call(E, F)])),
        ],
      }),
    );
    expect(Object.fromEntries(review.functions.map(({ id, mark }) => [id, mark]))).toEqual({
      [A]: 'changed',
      [B]: 'neighbour',
      [E]: 'added',
      [F]: 'neighbour',
    });
    expect(review.calls).toEqual([
      { caller: E, callee: F, mark: 'added' },
      { caller: A, callee: B, mark: 'added' },
    ]);
  });

  it('marks the functions of a language that only the branch reads as added', () => {
    const review = reviewOf(
      reviewGraphsOf({
        base: [inLanguage('first', graph([fn(A)]))],
        branch: [inLanguage('first', graph([fn(A)])), inLanguage('second', graph([fn(E)]))],
      }),
    );
    expect(review.functions).toEqual([{ ...fn(E), mark: 'added' }]);
  });
});

describe('the order of a review', () => {
  it('lists functions by id and calls by caller and callee, whatever order the graphs use', () => {
    const base = graph([fn(D)]);
    const branch = graph([fn(D), fn(C), fn(B), fn(A)], [call(C, D), call(A, D), call(A, B)]);
    const review = reviewOf(reviewGraphsOf({ base: [base], branch: [branch] }));
    expect(review.functions.map(({ id }) => id)).toEqual([A, B, C, D]);
    expect(review.calls.map(({ caller, callee }) => `${caller}>${callee}`)).toEqual([
      `${A}>${B}`,
      `${A}>${D}`,
      `${C}>${D}`,
    ]);
  });

  it('gives an empty review when the branch changes no function', () => {
    const same = graph([fn(A), fn(B)], [call(A, B)]);
    expect(reviewOf(reviewGraphsOf({ base: [same], branch: [same] }))).toEqual({
      functions: [],
      calls: [],
      openEnds: [],
      oneOfGroups: [],
      resolutionRates: [
        {
          language: 'example',
          checker: { name: 'Example', version: '1.0.0' },
          resolved: 1,
          open: 0,
          rate: 1,
        },
      ],
    });
  });
});
