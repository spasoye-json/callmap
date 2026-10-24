import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import type { Call, GraphDocument } from '@callmap/graph-document';
import { extractGraphDocument } from '../src/index.ts';

const FIXTURE = fileURLToPath(new URL('../fixture-resolution', import.meta.url));

let extracted: GraphDocument | undefined;
const document = (): GraphDocument =>
  (extracted ??= readGraphDocument(extractGraphDocument({ repo: FIXTURE })));

const callsFrom = (caller: string): readonly Call[] =>
  document().calls.filter((call) => call.caller === caller);

const CALLBACKS = 'src/callbacks.ts';

describe('a call inside a callback', () => {
  it('is a call of the function that holds a callback passed to map', () => {
    expect(callsFrom(`${CALLBACKS}#doubleAll`)).toEqual([
      { caller: `${CALLBACKS}#doubleAll`, callee: `${CALLBACKS}#double`, line: 4 },
    ]);
  });

  it('is a call of the function that holds a callback passed to then', () => {
    expect(callsFrom(`${CALLBACKS}#doubleLater`)).toEqual([
      { caller: `${CALLBACKS}#doubleLater`, callee: `${CALLBACKS}#double`, line: 7 },
    ]);
  });
});

const openEndsIn = (file: string) =>
  document().openEnds.filter(({ caller }) => caller.startsWith(`${file}#`));

describe('a call the graph leaves out', () => {
  it('leaves out a call into a library, as a call and as an open end', () => {
    expect(callsFrom(`${CALLBACKS}#doubleAll`).map(({ callee }) => callee)).toEqual([
      `${CALLBACKS}#double`,
    ]);
    expect(openEndsIn(CALLBACKS)).toEqual([]);
  });

  it('leaves out a call that no named function holds', () => {
    expect(callsFrom(`${CALLBACKS}#double`)).toEqual([]);
    expect(document().calls.filter(({ line }) => line === 9)).toEqual([]);
  });
});

const UNTYPED = 'src/untyped.ts';

describe('an open end', () => {
  it('marks a call on an untyped value with its caller, its line, the text of the callee and its reason', () => {
    expect(openEndsIn(UNTYPED)).toContainEqual({
      caller: `${UNTYPED}#relay`,
      line: 4,
      expression: 'JSON.parse(raw).notify',
      reason: 'untyped',
    });
  });

  it('marks a call into a module that does not resolve as missing-module, not untyped', () => {
    expect(openEndsIn(UNTYPED)).toContainEqual({
      caller: `${UNTYPED}#mail`,
      line: 8,
      expression: 'mailer.send',
      reason: 'missing-module',
    });
  });

  it('marks a call of a callback that the function was handed', () => {
    expect(openEndsIn(UNTYPED)).toContainEqual({
      caller: `${UNTYPED}#notifyEach`,
      line: 12,
      expression: 'hook',
      reason: 'function-value',
    });
  });
});

const REASONS = 'src/reasons.ts';

const reasonsFrom = (name: string) =>
  document()
    .openEnds.filter(({ caller }) => caller === `${REASONS}#${name}`)
    .map(({ expression, reason }) => [expression, reason]);

describe('the reason of an open end', () => {
  it.each([
    ['callMissing', [['missing', 'missing-module']]],
    ['Checkout.emit', [['this.hooks[event]', 'dynamic-key']]],
    ['Checkout.charge', [['this.gateway.charge', 'untyped']]],
    ['callAny', [['x', 'untyped']]],
    ['callParsed', [['JSON.parse(s).go', 'untyped']]],
    ['callAnyKey', [['o[k]', 'untyped']]],
    ['callCallback', [['done', 'function-value']]],
    [
      'callLocal',
      [
        ['make', 'function-value'],
        ['hook', 'function-value'],
      ],
    ],
    ['Checkout.paid', [['this.onPaid', 'function-value']]],
    ['callLiteralKey', [["hooks['paid']", 'function-value']]],
    [
      'callResult',
      [
        ['make()', 'function-value'],
        ['make', 'function-value'],
      ],
    ],
    ['construct', [['C', 'function-value']]],
    ['callUnion', [['fn', 'function-value']]],
    ['Checkout.done', [['this.opt?.fn', 'function-value']]],
    ['Job.finish', [['this.onDone', 'function-value']]],
    ['callDeclaredHook', [['declaredHook', 'function-value']]],
    ['callInterface', [['ledger.record', 'no-implementation']]],
    ['Job.start', [['this.run', 'no-implementation']]],
    ['callDeclared', [['declared', 'no-implementation']]],
    ['callDeclaredObject', [['api.go', 'no-implementation']]],
    ['callUnknown', [['v', 'other']]],
  ])('names the reason of each open end of %s', (name, reasons) => {
    expect(reasonsFrom(name)).toEqual(reasons);
  });
});

const CHANNELS = 'src/channels.ts';
const SHAPES = 'src/shapes.ts';
const LIMITS = 'src/limits.ts';
const PRINTERS = 'src/printers.ts';

describe('a one-of call', () => {
  it('ties a call through an interface to each class that implements it, in one group', () => {
    expect(callsFrom(`${CHANNELS}#broadcast`)).toEqual([
      {
        caller: `${CHANNELS}#broadcast`,
        callee: `${CHANNELS}#Mail.send`,
        line: 21,
        group: `${CHANNELS}:21:78`,
      },
      {
        caller: `${CHANNELS}#broadcast`,
        callee: `${CHANNELS}#Sms.send`,
        line: 21,
        group: `${CHANNELS}:21:78`,
      },
    ]);
  });

  it('marks a call through an interface that no class implements as an open end', () => {
    expect(callsFrom(`${CHANNELS}#archive`)).toEqual([]);
    expect(openEndsIn(CHANNELS)).toEqual([
      {
        caller: `${CHANNELS}#archive`,
        line: 24,
        expression: 'target.store',
        reason: 'no-implementation',
      },
    ]);
  });

  it('ties a call of an abstract method to each class that implements it', () => {
    expect(callsFrom(`${SHAPES}#Shape.describe`)).toEqual([
      {
        caller: `${SHAPES}#Shape.describe`,
        callee: `${SHAPES}#Square.area`,
        line: 5,
        group: `${SHAPES}:5:20`,
      },
    ]);
    expect(openEndsIn(SHAPES)).toEqual([]);
  });

  it('ties a call through a map of strategies to each object literal that implements the rule', () => {
    expect(callsFrom(`${LIMITS}#Limits.allows`)).toEqual([
      {
        caller: `${LIMITS}#Limits.allows`,
        callee: `${LIMITS}#Limits.smallRule.allows`,
        line: 15,
        group: `${LIMITS}:15:29`,
      },
      {
        caller: `${LIMITS}#Limits.allows`,
        callee: `${LIMITS}#Limits.largeRule.allows`,
        line: 15,
        group: `${LIMITS}:15:29`,
      },
    ]);
  });

  it('gives each call of a chain through 2 interfaces its own group', () => {
    const caller = `${PRINTERS}#colourOf`;
    expect(callsFrom(caller)).toEqual([
      { caller, callee: `${PRINTERS}#BlackInk.colour`, line: 33, group: `${PRINTERS}:33:69` },
      { caller, callee: `${PRINTERS}#RedInk.colour`, line: 33, group: `${PRINTERS}:33:69` },
      { caller, callee: `${PRINTERS}#Laser.ink`, line: 33, group: `${PRINTERS}:33:63` },
      { caller, callee: `${PRINTERS}#Jet.ink`, line: 33, group: `${PRINTERS}:33:63` },
    ]);
  });

  it('gives each call of a chain over several lines its own group', () => {
    const caller = `${PRINTERS}#titleColourOf`;
    expect(callsFrom(caller)).toEqual([
      { caller, callee: `${PRINTERS}#BlackInk.colour`, line: 38, group: `${PRINTERS}:38:6` },
      { caller, callee: `${PRINTERS}#RedInk.colour`, line: 38, group: `${PRINTERS}:38:6` },
      { caller, callee: `${PRINTERS}#Laser.ink`, line: 37, group: `${PRINTERS}:37:6` },
      { caller, callee: `${PRINTERS}#Jet.ink`, line: 37, group: `${PRINTERS}:37:6` },
    ]);
  });
});
