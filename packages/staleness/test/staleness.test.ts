import { describe, expect, it } from 'vitest';
import {
  candidate,
  checkoutFlow,
  clone,
  CONTROLLER_FILE,
  fixtureFileHashes,
  JOB_FILE,
  MODEL_FILE,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
  UNREFERENCED_FILE,
} from '@archmap/testing';
import {
  anchorSetOf,
  applyStamps,
  markFlow,
  markFlows,
  parseAnchorStore,
  readsAsFresh,
  repoSnapshot,
  serialiseAnchorStore,
  StalenessError,
  stampAnchors,
  stampOf,
  unreadableRepo,
} from '../src/index.ts';
import type { AnchorStore, RepoSnapshot } from '../src/index.ts';
import type { FlowDocument } from '@archmap/flow-document';

const snapshot = (patch: Record<string, string> = {}): RepoSnapshot =>
  repoSnapshot({ ...fixtureFileHashes(), ...patch });

const withoutFile = (file: string): RepoSnapshot => {
  const { [file]: _gone, ...rest } = fixtureFileHashes();
  return repoSnapshot(rest);
};

const stampOfCheckout = () => stampAnchors(checkoutFlow(), snapshot());

const storeOfCheckout = (): AnchorStore => ({ checkout: stampOfCheckout() });

describe('anchorSetOf', () => {
  it('names every file the flow nodes point at', () => {
    expect(anchorSetOf(checkoutFlow())).toEqual(
      [SCREEN_FILE, ORDERS_CLIENT_FILE, CONTROLLER_FILE, MODEL_FILE, JOB_FILE].sort(),
    );
  });

  it('names a file once, however many nodes point at it', () => {
    expect(anchorSetOf(checkoutFlow()).filter((file) => file === CONTROLLER_FILE)).toHaveLength(1);
  });

  it('names the files in path order', () => {
    expect(anchorSetOf(checkoutFlow())).toEqual([...anchorSetOf(checkoutFlow())].sort());
  });

  it('does not depend on the order the nodes were written in', () => {
    const flow = clone(checkoutFlow());
    expect(anchorSetOf({ ...flow, nodes: [...flow.nodes].reverse() })).toEqual(anchorSetOf(flow));
  });

  it('names nothing for a candidate, which is why a candidate can never be stale', () => {
    expect(anchorSetOf(candidate())).toEqual([]);
  });

  it('names no file only the entry point points at', () => {
    const flow = clone(checkoutFlow());
    const moved = { ...flow, entryPoint: { ...flow.entryPoint, file: UNREFERENCED_FILE } };
    expect(anchorSetOf(moved)).not.toContain(UNREFERENCED_FILE);
  });
});

describe('stampAnchors', () => {
  it('records a hash for every anchored file', () => {
    expect(Object.keys(stampOfCheckout()).sort()).toEqual(anchorSetOf(checkoutFlow()));
  });

  it('records the hash the repo holds', () => {
    expect(stampOfCheckout()[MODEL_FILE]).toBe(`hash-of-${MODEL_FILE}`);
  });

  it('records nothing for a file the flow does not anchor', () => {
    expect(stampOfCheckout()[UNREFERENCED_FILE]).toBeUndefined();
  });

  it('stamps the same flow the same way twice', () => {
    expect(stampOfCheckout()).toEqual(stampOfCheckout());
  });

  it('refuses a candidate, which has read no files', () => {
    expect(() => stampAnchors(candidate(), snapshot())).toThrow(StalenessError);
  });

  it('refuses a repo it could not read', () => {
    expect(() => stampAnchors(checkoutFlow(), unreadableRepo('no such directory'))).toThrow(
      /could not be read/,
    );
  });

  it('refuses when an anchored file is not in the repo', () => {
    expect(() => stampAnchors(checkoutFlow(), withoutFile(MODEL_FILE))).toThrow(MODEL_FILE);
  });
});

describe('applyStamps', () => {
  const documents = [checkoutFlow(), candidate()];

  it('stamps the flow it was named', () => {
    const store = applyStamps({}, documents, ['checkout'], snapshot());
    expect(stampOf(store, 'checkout')).toEqual(stampOfCheckout());
  });

  it('refuses to run without a flow id, so no blanket stamp mints a fresh mark', () => {
    expect(() => applyStamps({}, documents, [], snapshot())).toThrow(StalenessError);
  });

  it('refuses a flow id it holds no document for', () => {
    expect(() => applyStamps({}, documents, ['invented'], snapshot())).toThrow(/invented/);
  });

  it('refuses to replace a stamp a flow already holds', () => {
    expect(() => applyStamps(storeOfCheckout(), documents, ['checkout'], snapshot())).toThrow(
      /already stamped/,
    );
  });

  it('refuses a flow named twice in one stamp, because the second replaces the first', () => {
    expect(() => applyStamps({}, documents, ['checkout', 'checkout'], snapshot())).toThrow(
      /already stamped/,
    );
  });

  it('replaces a stamp when a re-stamp is asked for by hand', () => {
    const store = applyStamps(
      storeOfCheckout(),
      documents,
      ['checkout'],
      snapshot({ [MODEL_FILE]: 'new' }),
      {
        restamp: true,
      },
    );
    expect(stampOf(store, 'checkout')?.[MODEL_FILE]).toBe('new');
  });

  /**
   * A re-stamp says "replace what is there", and there being nothing there is not a contradiction:
   * the flow was traced and read, and the stamp it gains is the one it would have gained anyway.
   */
  it('stamps a flow that holds no stamp when a re-stamp is asked for', () => {
    const store = applyStamps({}, documents, ['checkout'], snapshot(), { restamp: true });
    expect(stampOf(store, 'checkout')).toEqual(stampOfCheckout());
  });

  it('leaves the stamp of a flow nobody named alone', () => {
    const store: AnchorStore = { other: { [MODEL_FILE]: 'kept' } };
    const stamped = applyStamps(store, documents, ['checkout'], snapshot());
    expect(stampOf(stamped, 'other')).toEqual({ [MODEL_FILE]: 'kept' });
  });

  it('does not change the store it was given', () => {
    const store: AnchorStore = {};
    applyStamps(store, documents, ['checkout'], snapshot());
    expect(store).toEqual({});
  });

  it('refuses to stamp a candidate', () => {
    expect(() => applyStamps({}, documents, ['refund-an-order'], snapshot())).toThrow(
      StalenessError,
    );
  });

  it('stamps two flows at once', () => {
    const second = { ...clone(checkoutFlow()), id: 'checkout-again' };
    const store = applyStamps(
      {},
      [...documents, second],
      ['checkout', 'checkout-again'],
      snapshot(),
    );
    expect(Object.keys(store).sort()).toEqual(['checkout', 'checkout-again']);
  });
});

describe('markFlow', () => {
  const mark = (store: AnchorStore, repo: RepoSnapshot, document = checkoutFlow()) =>
    markFlow(document, stampOf(store, document.id), repo);

  it('reads as fresh when every anchored file still hashes to its stamp', () => {
    expect(mark(storeOfCheckout(), snapshot()).state).toBe('fresh');
  });

  it('gives a fresh flow no reasons', () => {
    expect(mark(storeOfCheckout(), snapshot()).reasons).toEqual([]);
  });

  it('reads as stale when an anchored file changed', () => {
    expect(mark(storeOfCheckout(), snapshot({ [MODEL_FILE]: 'changed' })).state).toBe('stale');
  });

  it('names the file that changed', () => {
    expect(mark(storeOfCheckout(), snapshot({ [MODEL_FILE]: 'changed' })).reasons).toEqual([
      { code: 'changed', file: MODEL_FILE },
    ]);
  });

  it('reads as stale when an anchored file is gone', () => {
    expect(mark(storeOfCheckout(), withoutFile(JOB_FILE)).reasons).toEqual([
      { code: 'gone', file: JOB_FILE },
    ]);
  });

  it('reads as stale when the document anchors a file the stamp never checked', () => {
    const flow = clone(checkoutFlow());
    const gained = {
      ...flow,
      nodes: [
        ...flow.nodes,
        {
          id: 'touch-user',
          kind: 'side-effect' as const,
          label: 'Bump the user record',
          lane: 'backend',
          file: UNREFERENCED_FILE,
          line: 3,
        },
      ],
    };
    expect(mark(storeOfCheckout(), snapshot(), gained).reasons).toEqual([
      { code: 'gained', file: UNREFERENCED_FILE },
    ]);
  });

  it('reads as stale when the stamp holds a file the document no longer names', () => {
    const store: AnchorStore = {
      checkout: { ...stampOfCheckout(), [UNREFERENCED_FILE]: 'hash' },
    };
    expect(mark(store, snapshot()).reasons).toEqual([{ code: 'dropped', file: UNREFERENCED_FILE }]);
  });

  it('reports every reason at once', () => {
    const store: AnchorStore = {
      checkout: { ...stampOfCheckout(), [UNREFERENCED_FILE]: 'hash' },
    };
    expect(mark(store, snapshot({ [MODEL_FILE]: 'changed' })).reasons).toEqual([
      { code: 'changed', file: MODEL_FILE },
      { code: 'dropped', file: UNREFERENCED_FILE },
    ]);
  });

  it('orders the reasons by file, so a mark reads the same every time', () => {
    const repo = snapshot({ [MODEL_FILE]: 'changed', [SCREEN_FILE]: 'changed' });
    expect(mark(storeOfCheckout(), repo).reasons.map((reason) => reason.file)).toEqual(
      [MODEL_FILE, SCREEN_FILE].sort(),
    );
  });

  it('ignores a change to a file the flow does not anchor', () => {
    expect(mark(storeOfCheckout(), snapshot({ [UNREFERENCED_FILE]: 'changed' })).state).toBe(
      'fresh',
    );
  });

  it('reads a candidate as a candidate, never as stale', () => {
    expect(markFlow(candidate(), undefined, snapshot()).state).toBe('candidate');
  });

  it('reads a traced flow with no stamp as unstamped', () => {
    expect(mark({}, snapshot()).state).toBe('unstamped');
  });

  it('reads a repo it cannot read as unknown', () => {
    expect(mark(storeOfCheckout(), unreadableRepo('the worktree is gone')).state).toBe('unknown');
  });

  it('reads an unstamped flow as unstamped even when the repo cannot be read', () => {
    expect(mark({}, unreadableRepo('the worktree is gone')).state).toBe('unstamped');
  });

  it('carries the flow id onto the mark', () => {
    expect(mark(storeOfCheckout(), snapshot()).flowId).toBe('checkout');
  });

  it('never re-traces, so the document comes back untouched', () => {
    const flow = checkoutFlow();
    mark(storeOfCheckout(), snapshot({ [MODEL_FILE]: 'changed' }), flow);
    expect(flow).toEqual(checkoutFlow());
  });
});

describe('readsAsFresh', () => {
  const stateOf = (state: 'fresh' | 'stale' | 'unstamped' | 'unknown' | 'candidate') => ({
    flowId: 'checkout',
    state,
    reasons: [],
  });

  it('is true for a fresh flow', () => {
    expect(readsAsFresh(stateOf('fresh'))).toBe(true);
  });

  it('is false for a stale flow', () => {
    expect(readsAsFresh(stateOf('stale'))).toBe(false);
  });

  it('is false for an unstamped flow, so a missing stamp is never mistaken for a checked one', () => {
    expect(readsAsFresh(stateOf('unstamped'))).toBe(false);
  });

  it('is false for an unknown repo', () => {
    expect(readsAsFresh(stateOf('unknown'))).toBe(false);
  });

  it('is false for a candidate', () => {
    expect(readsAsFresh(stateOf('candidate'))).toBe(false);
  });
});

describe('markFlows', () => {
  const documents = [checkoutFlow(), candidate()];

  it('marks every flow the repo holds', () => {
    expect(markFlows(documents, storeOfCheckout(), snapshot())).toHaveLength(2);
  });

  it('marks them in flow id order', () => {
    expect(markFlows(documents, storeOfCheckout(), snapshot()).map((mark) => mark.flowId)).toEqual([
      'checkout',
      'refund-an-order',
    ]);
  });

  it('reads each flow against its own stamp', () => {
    const marks = markFlows(documents, storeOfCheckout(), snapshot());
    expect(marks.map((mark) => mark.state)).toEqual(['fresh', 'candidate']);
  });

  it('marks nothing when the repo holds no flows', () => {
    expect(markFlows([], {}, snapshot())).toEqual([]);
  });

  /**
   * A badge exists so a mark nobody checked can never read as a checked pass, and the picker refuses
   * two marks that claim one flow for exactly that reason: reading one and dropping the other would
   * let a stale mark be covered by a fresh one. Marking is where those marks come from, so the same
   * pair has to be refused here, or the producer mints the set the next stage exists to reject.
   */
  it('refuses two documents that claim one flow id, rather than marking it twice', () => {
    expect(() => markFlows([checkoutFlow(), checkoutFlow()], {}, snapshot())).toThrow(
      StalenessError,
    );
  });

  it('names the twice-claimed flow when it refuses', () => {
    expect(() => markFlows([checkoutFlow(), checkoutFlow()], {}, snapshot())).toThrow('checkout');
  });

  it('refuses two documents that claim one id even when they disagree', () => {
    const one = clone(checkoutFlow());
    const two = { ...clone(checkoutFlow()), nodes: [], edges: [] };
    expect(() => markFlows([one, two], {}, snapshot())).toThrow(StalenessError);
  });
});

describe('a stamp that recorded nothing', () => {
  /**
   * An empty stamp is a stamp all the same, so it reads as a trace that was checked against no
   * files at all rather than as a flow nobody stamped. Every file the flow anchors is one the stamp
   * never checked, which is what `gained` says, so the flow reads stale and never fresh.
   */
  it('reads a traced flow as stale, not as unstamped', () => {
    expect(markFlow(checkoutFlow(), {}, snapshot()).state).toBe('stale');
  });

  it('names every anchored file as one the stamp never checked', () => {
    const mark = markFlow(checkoutFlow(), {}, snapshot());
    expect(mark.reasons.map((reason) => reason.code)).toEqual(
      anchorSetOf(checkoutFlow()).map(() => 'gained'),
    );
  });

  it('is never mistaken for a checked pass', () => {
    expect(readsAsFresh(markFlow(checkoutFlow(), {}, snapshot()))).toBe(false);
  });
});

describe('two documents that claim one flow id', () => {
  /**
   * A stamp claims "these are the files I read", which is only true of one trace. Taking whichever
   * of two documents came first would stamp one flow's anchor set under the other's id, and a stamp
   * that was never of that trace reads as fresh, which is the one thing ADR-0008 exists to prevent.
   */
  it('are refused by applyStamps, rather than the first one winning', () => {
    expect(() =>
      applyStamps({}, [checkoutFlow(), checkoutFlow()], ['checkout'], snapshot()),
    ).toThrow(StalenessError);
  });

  it('are named by applyStamps when it refuses', () => {
    expect(() =>
      applyStamps({}, [checkoutFlow(), checkoutFlow()], ['checkout'], snapshot()),
    ).toThrow('checkout');
  });

  it('are refused even when only the other flow was named', () => {
    expect(() =>
      applyStamps(
        {},
        [checkoutFlow(), checkoutFlow(), candidate()],
        ['refund-an-order'],
        snapshot(),
      ),
    ).toThrow(StalenessError);
  });
});

describe('stampOf', () => {
  it('finds the stamp of a stamped flow', () => {
    expect(stampOf(storeOfCheckout(), 'checkout')).toEqual(stampOfCheckout());
  });

  it('finds no stamp for a flow that has none', () => {
    expect(stampOf(storeOfCheckout(), 'refund-an-order')).toBeUndefined();
  });

  it('finds no stamp for an inherited property name', () => {
    expect(stampOf(storeOfCheckout(), 'toString')).toBeUndefined();
  });
});

describe('a store with nothing in it', () => {
  it('is serialised as an empty object', () => {
    expect(serialiseAnchorStore({})).toBe('{}\n');
  });

  it('reads back as an empty store', () => {
    expect(parseAnchorStore(serialiseAnchorStore({}))).toEqual({});
  });

  it('holds a stamp of a flow that anchors nothing', () => {
    expect(parseAnchorStore(serialiseAnchorStore({ checkout: {} }))).toEqual({ checkout: {} });
  });
});

describe('the committed anchor stamps', () => {
  it('read back as they were written', () => {
    expect(parseAnchorStore(serialiseAnchorStore(storeOfCheckout()))).toEqual(storeOfCheckout());
  });

  it('are written with the flow ids in order, so one re-stamp does not churn the diff', () => {
    const text = serialiseAnchorStore({ zebra: {}, checkout: {} });
    expect(text.indexOf('checkout')).toBeLessThan(text.indexOf('zebra'));
  });

  it('are written with the files in order', () => {
    const text = serialiseAnchorStore({ checkout: { 'b.rb': 'two', 'a.rb': 'one' } });
    expect(text.indexOf('a.rb')).toBeLessThan(text.indexOf('b.rb'));
  });

  it('end with a newline, like every other committed file', () => {
    expect(serialiseAnchorStore(storeOfCheckout()).endsWith('\n')).toBe(true);
  });

  it('read an empty store', () => {
    expect(parseAnchorStore('{}')).toEqual({});
  });

  it('refuse text that is not JSON', () => {
    expect(() => parseAnchorStore('{ not json')).toThrow(StalenessError);
  });

  it('refuse JSON that is not an object', () => {
    expect(() => parseAnchorStore('[]')).toThrow(StalenessError);
  });

  it('refuse a stamp that is not a hash per file', () => {
    expect(() => parseAnchorStore('{"checkout": "abc"}')).toThrow(StalenessError);
  });

  it('refuse a hash that is not a string', () => {
    expect(() => parseAnchorStore('{"checkout": {"a.rb": 7}}')).toThrow(/a.rb/);
  });

  it('refuse an empty hash', () => {
    expect(() => parseAnchorStore('{"checkout": {"a.rb": "  "}}')).toThrow(StalenessError);
  });
});

describe('a name Object.prototype already carries', () => {
  /**
   * `stampOf` already reads the store by own property, so a flow id of `toString` reads as
   * unstamped rather than as a function. Every other lookup owes the same discipline: a hash is
   * read out of a snapshot the host built and out of a stamp parsed from a committed file, and both
   * are plain objects keyed by paths a producer chose. A file named after a name
   * `Object.prototype` carries must read as absent, never as an inherited function, or the core
   * would stamp a function where a hash belongs and mark a missing file as changed.
   */
  const inherited = (file: string): FlowDocument => {
    const document = clone(candidate());
    return {
      ...document,
      lanes: [{ id: 'only', name: 'Only' }],
      nodes: [{ id: 'reads', kind: 'step', label: 'Reads the file', lane: 'only', file, line: 1 }],
    };
  };

  const NAMES = ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'];

  /**
   * One entry, as an own property. An object literal drops `__proto__` on the floor, so a fixture
   * written as one would not put the case it means in front of the code.
   */
  const only = <T>(key: string, value: T): Record<string, T> => Object.fromEntries([[key, value]]);

  it.each(NAMES)('refuses to stamp a flow anchoring %s, which the repo does not hold', (name) => {
    expect(() => stampAnchors(inherited(name), repoSnapshot({}))).toThrow(StalenessError);
  });

  it.each(NAMES)('never stamps %s with an inherited value in place of a hash', (name) => {
    const stamped = stampAnchors(inherited(name), repoSnapshot(only(name, 'hash-of-it')));
    expect(stamped).toEqual(only(name, 'hash-of-it'));
  });

  it.each(NAMES)('marks a flow anchoring %s as gone when the repo does not hold it', (name) => {
    const mark = markFlow(inherited(name), only(name, 'hash-of-it'), repoSnapshot({}));
    expect(mark).toEqual({
      flowId: 'refund-an-order',
      state: 'stale',
      reasons: [{ code: 'gone', file: name }],
    });
  });

  it.each(NAMES)('marks a flow that gained %s as gained, not as fresh', (name) => {
    const mark = markFlow(inherited(name), {}, repoSnapshot(only(name, 'hash-of-it')));
    expect(mark.state).toBe('stale');
    expect(mark.reasons).toEqual([{ code: 'gained', file: name }]);
  });

  it.each(NAMES)('reads a flow anchoring %s as fresh when its hash still holds', (name) => {
    const mark = markFlow(
      inherited(name),
      only(name, 'hash-of-it'),
      repoSnapshot(only(name, 'hash-of-it')),
    );
    expect(mark).toEqual({ flowId: 'refund-an-order', state: 'fresh', reasons: [] });
  });

  it('reads a flow id of __proto__ back off the committed file', () => {
    const store = parseAnchorStore('{"__proto__":{"a.rb":"hash-of-a"}}');
    expect(stampOf(store, '__proto__')).toEqual({ 'a.rb': 'hash-of-a' });
  });

  it('does not let a flow id of __proto__ reach the prototype of the store it parsed', () => {
    const store = parseAnchorStore('{"__proto__":{"a.rb":"hash-of-a"}}');
    expect(Object.keys(store)).toEqual(['__proto__']);
    expect(stampOf(store, 'a.rb')).toBeUndefined();
  });

  it('reads a file named __proto__ back off the committed file', () => {
    const store = parseAnchorStore('{"refund":{"__proto__":"hash-of-it"}}');
    expect(stampOf(store, 'refund')).toEqual(only('__proto__', 'hash-of-it'));
  });

  it('refuses a stamp whose hash is an inherited name rather than a string', () => {
    expect(() => parseAnchorStore('{"refund":{"a.rb":null}}')).toThrow(StalenessError);
  });

  it('writes a flow id of __proto__ back out', () => {
    const store = parseAnchorStore('{"__proto__":{"a.rb":"hash-of-a"}}');
    expect(serialiseAnchorStore(store)).toBe(
      `${JSON.stringify(only('__proto__', { 'a.rb': 'hash-of-a' }), null, 2)}\n`,
    );
  });

  it('carries a stamp under an inherited name through the committed file unchanged', () => {
    const store = parseAnchorStore('{"toString":{"valueOf":"hash-of-it"}}');
    expect(parseAnchorStore(serialiseAnchorStore(store))).toEqual(store);
  });
});

describe('a candidate that still holds a stamp', () => {
  /**
   * A stamp survives a flow nobody names, so a traced flow that is discovered afresh, or reverted
   * by hand, comes back as a candidate under an id the committed store still stamps. The stamp is
   * compared in both directions, and a file the stamp holds that the document no longer names means
   * the trace was edited after it was stamped (ADR-0008). A candidate is the far end of that: it
   * names none of them. Reading it as a plain candidate would show the reader a picker row with no
   * badge on it, which is the one thing a badge exists to prevent.
   */
  const stampOfTrace = (): AnchorStore => ({
    'refund-an-order': { [CONTROLLER_FILE]: 'hash-of-then', [MODEL_FILE]: 'hash-of-then' },
  });

  const mark = (snapshot: RepoSnapshot = repoSnapshot(fixtureFileHashes())) =>
    markFlow(candidate(), stampOf(stampOfTrace(), 'refund-an-order'), snapshot);

  it('reads as stale, not as a candidate, because the trace it was stamped against is gone', () => {
    expect(mark().state).toBe('stale');
  });

  it('names every file the stamp holds and the document no longer does', () => {
    expect(mark().reasons).toEqual([
      { code: 'dropped', file: CONTROLLER_FILE },
      { code: 'dropped', file: MODEL_FILE },
    ]);
  });

  it('reads the same whether or not the host could read the repo, because both files are committed', () => {
    expect(mark(unreadableRepo('the worktree is gone'))).toEqual(
      mark(repoSnapshot(fixtureFileHashes())),
    );
  });

  it('never reads as fresh', () => {
    expect(readsAsFresh(mark())).toBe(false);
  });

  it('still reads as a candidate when no stamp claims it', () => {
    expect(markFlow(candidate(), undefined, repoSnapshot(fixtureFileHashes())).state).toBe(
      'candidate',
    );
  });

  it('is marked over a whole repo the same way', () => {
    const marks = markFlows([candidate()], stampOfTrace(), repoSnapshot(fixtureFileHashes()));
    expect(marks.map((one) => one.state)).toEqual(['stale']);
  });

  it('is still refused a stamp, so the contradiction can only be cleared by a re-trace', () => {
    expect(() =>
      applyStamps(stampOfTrace(), [candidate()], ['refund-an-order'], repoSnapshot({}), {
        restamp: true,
      }),
    ).toThrow(StalenessError);
  });
});

describe('a stamp that names no file', () => {
  /**
   * `stampAnchors` refuses a candidate, so a stamp naming nothing is not one the core ever wrote.
   * The committed file still reads it back, so the marking rules have to say what it means: it
   * describes no trace, so there is nothing a candidate dropped by no longer naming it.
   */
  it('leaves a candidate reading as a candidate, because there is nothing it dropped', () => {
    expect(markFlow(candidate(), {}, snapshot()).state).toBe('candidate');
  });

  it('gives that candidate no reasons, so stale always names the file that made it stale', () => {
    expect(markFlow(candidate(), {}, snapshot()).reasons).toEqual([]);
  });

  it('reads a traced flow as stale, because every file it anchors is one nothing checked', () => {
    const mark = markFlow(checkoutFlow(), {}, snapshot());
    expect(mark.state).toBe('stale');
    expect(mark.reasons.map((reason) => reason.code)).toEqual(
      anchorSetOf(checkoutFlow()).map(() => 'gained'),
    );
  });
});
