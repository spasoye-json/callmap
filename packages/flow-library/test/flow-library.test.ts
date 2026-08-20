import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, clone, SCREEN_FILE } from '@archmap/testing';
import type { StalenessMark } from '@archmap/staleness';
import {
  buildFlowPicker,
  createFlowLibrary,
  FlowLibraryError,
  summariseLibrary,
} from '../src/index.ts';
import type { FlowLibrary } from '../src/index.ts';

const repoOfTwo = (): FlowLibrary => createFlowLibrary([checkoutFlow(), candidate()]);

const mark = (flowId: string, state: StalenessMark['state']): StalenessMark => ({
  flowId,
  state,
  reasons: [],
});

describe('createFlowLibrary', () => {
  it('holds every flow document the repo carries', () => {
    expect(repoOfTwo().size).toBe(2);
  });

  it('holds no flow for an empty repo', () => {
    expect(createFlowLibrary([]).entries).toEqual([]);
  });

  it('finds a flow by id', () => {
    expect(repoOfTwo().get('checkout')?.name).toBe('Place an order from the checkout screen');
  });

  it('finds no flow the repo does not hold', () => {
    expect(repoOfTwo().get('invented')).toBeUndefined();
  });

  it('answers whether it holds a flow', () => {
    expect(repoOfTwo().has('refund-an-order')).toBe(true);
  });

  it('answers whether it does not hold a flow', () => {
    expect(repoOfTwo().has('invented')).toBe(false);
  });

  it('lists the flows in name order, so the picker never reshuffles', () => {
    const library = createFlowLibrary([
      { ...clone(candidate()), id: 'z', name: 'Zebra crossing' },
      { ...clone(candidate()), id: 'a', name: 'Apple picking' },
    ]);
    expect(library.entries.map((entry) => entry.id)).toEqual(['a', 'z']);
  });

  it('breaks a tie on the name with the id', () => {
    const library = createFlowLibrary([
      { ...clone(candidate()), id: 'b', name: 'One name' },
      { ...clone(candidate()), id: 'a', name: 'One name' },
    ]);
    expect(library.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not depend on the order the documents arrived in', () => {
    const forwards = createFlowLibrary([checkoutFlow(), candidate()]);
    const backwards = createFlowLibrary([candidate(), checkoutFlow()]);
    expect(forwards.entries).toEqual(backwards.entries);
  });

  it('lists the documents in the same order as the entries', () => {
    const library = repoOfTwo();
    expect(library.documents().map((document) => document.id)).toEqual(
      library.entries.map((entry) => entry.id),
    );
  });

  it('refuses two flows that claim one id', () => {
    expect(() => createFlowLibrary([checkoutFlow(), checkoutFlow()])).toThrow(FlowLibraryError);
  });

  it('names the clashing id when it refuses', () => {
    expect(() => createFlowLibrary([checkoutFlow(), checkoutFlow()])).toThrow(/checkout/);
  });
});

describe('a library entry', () => {
  it('reads a traced flow as traced', () => {
    expect(repoOfTwo().get('checkout')?.state).toBe('traced');
  });

  it('lets a traced flow be opened on the canvas', () => {
    expect(repoOfTwo().get('checkout')?.openable).toBe(true);
  });

  it('reads the state of a traced flow off the document, not off a second field', () => {
    const entry = repoOfTwo().get('checkout');
    expect(entry?.openable).toBe(entry?.state === 'traced');
  });

  it('reads a flow with no nodes as a candidate', () => {
    expect(repoOfTwo().get('refund-an-order')?.state).toBe('candidate');
  });

  it('greys a candidate out, because there is nothing to draw yet', () => {
    expect(repoOfTwo().get('refund-an-order')?.openable).toBe(false);
  });

  it('leaves a candidate to be traced when the reader opens it, which is when tokens are spent', () => {
    const entry = repoOfTwo().get('refund-an-order');
    expect([entry?.state, entry?.openable]).toEqual(['candidate', false]);
  });

  it('counts the nodes of a traced flow', () => {
    expect(repoOfTwo().get('checkout')?.nodeCount).toBe(8);
  });

  it('counts the lanes of a traced flow', () => {
    expect(repoOfTwo().get('checkout')?.laneCount).toBe(3);
  });

  it('counts no nodes on a candidate', () => {
    expect(repoOfTwo().get('refund-an-order')?.nodeCount).toBe(0);
  });

  it('carries the entry point, so the picker can say where a flow starts', () => {
    expect(repoOfTwo().get('checkout')?.entryPoint).toEqual({
      kind: 'screen',
      file: SCREEN_FILE,
      line: 12,
    });
  });

  it('carries the document itself, so opening a flow costs no second lookup', () => {
    expect(repoOfTwo().get('checkout')?.document.edges).toHaveLength(7);
  });
});

describe('summariseLibrary', () => {
  it('counts every flow', () => {
    expect(summariseLibrary(repoOfTwo()).total).toBe(2);
  });

  it('counts the traced flows', () => {
    expect(summariseLibrary(repoOfTwo()).traced).toBe(1);
  });

  it('counts the candidates', () => {
    expect(summariseLibrary(repoOfTwo()).candidates).toBe(1);
  });

  it('counts nothing in an empty repo', () => {
    expect(summariseLibrary(createFlowLibrary([]))).toEqual({
      total: 0,
      traced: 0,
      candidates: 0,
    });
  });
});

describe('buildFlowPicker', () => {
  it('holds one row per flow', () => {
    expect(buildFlowPicker(repoOfTwo())).toHaveLength(2);
  });

  it('keeps the order of the library', () => {
    const library = repoOfTwo();
    expect(buildFlowPicker(library).map((row) => row.id)).toEqual(
      library.entries.map((entry) => entry.id),
    );
  });

  it('carries the entry through, so a row is openable or greyed out', () => {
    const rows = buildFlowPicker(repoOfTwo());
    expect(rows.map((row) => row.openable)).toEqual([true, false]);
  });

  it('shows no badge on a flow that reads as fresh', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'fresh')]);
    expect(rows.find((row) => row.id === 'checkout')?.badge).toBeNull();
  });

  it('badges a stale flow', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'stale')]);
    expect(rows.find((row) => row.id === 'checkout')?.badge).toBe('stale');
  });

  it('badges an unstamped flow, so a missing stamp is never mistaken for a checked one', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'unstamped')]);
    expect(rows.find((row) => row.id === 'checkout')?.badge).toBe('unstamped');
  });

  it('badges a flow whose repo could not be read', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'unknown')]);
    expect(rows.find((row) => row.id === 'checkout')?.badge).toBe('unknown');
  });

  it('shows no badge on a candidate, which cannot be stale', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('refund-an-order', 'candidate')]);
    expect(rows.find((row) => row.id === 'refund-an-order')?.badge).toBeNull();
  });

  /**
   * Marking reads a candidate that still holds a stamp as stale, because the trace the stamp was
   * taken of is gone (ADR-0008). The row is a candidate either way, greyed out and waiting for a
   * trace, and the badge is what tells the reader the stamp beside it describes nothing.
   */
  it('badges a candidate the mark reads as stale, greyed out and badged at once', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('refund-an-order', 'stale')]);
    const row = rows.find((one) => one.id === 'refund-an-order');
    expect([row?.state, row?.openable, row?.badge]).toEqual(['candidate', false, 'stale']);
  });

  it('carries the staleness state through for a reader who wants the detail', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'stale')]);
    expect(rows.find((row) => row.id === 'checkout')?.staleness).toBe('stale');
  });

  it('reads a flow no mark covers as unmarked', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('checkout', 'fresh')]);
    expect(rows.find((row) => row.id === 'refund-an-order')?.staleness).toBeNull();
  });

  it('shows no badge on an unmarked flow', () => {
    const rows = buildFlowPicker(repoOfTwo(), []);
    expect(rows.every((row) => row.badge === null)).toBe(true);
  });

  it('ignores a mark for a flow the library does not hold', () => {
    const rows = buildFlowPicker(repoOfTwo(), [mark('invented', 'stale')]);
    expect(rows.map((row) => row.id)).toEqual(repoOfTwo().entries.map((entry) => entry.id));
  });

  it('refuses two marks that claim one flow, rather than letting the last one win', () => {
    expect(() =>
      buildFlowPicker(repoOfTwo(), [mark('checkout', 'stale'), mark('checkout', 'fresh')]),
    ).toThrow(FlowLibraryError);
  });

  it('names the twice-marked flow when it refuses', () => {
    expect(() =>
      buildFlowPicker(repoOfTwo(), [mark('checkout', 'stale'), mark('checkout', 'fresh')]),
    ).toThrow(/checkout/);
  });

  it('refuses two marks even for a flow it does not hold, because one of them is wrong', () => {
    expect(() =>
      buildFlowPicker(repoOfTwo(), [mark('invented', 'stale'), mark('invented', 'fresh')]),
    ).toThrow(FlowLibraryError);
  });

  it('accepts one mark per flow', () => {
    const rows = buildFlowPicker(repoOfTwo(), [
      mark('checkout', 'stale'),
      mark('refund-an-order', 'candidate'),
    ]);
    expect(rows.map((row) => row.badge)).toEqual(['stale', null]);
  });
});
