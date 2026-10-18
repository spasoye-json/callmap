import { describe, expect, it } from 'vitest';
import { CONTROLLER_FILE, fixtureReferenceGraph, SCREEN_FILE } from '@archmap/testing';
import { candidateOf, DiscoveryError, readDiscoveryAnswer } from '../src/index.ts';
import type { ProposedEntryPoint } from '../src/index.ts';

const referenceGraph = fixtureReferenceGraph();

const answer = (...proposedEntryPoints: unknown[]): string =>
  JSON.stringify({ proposedEntryPoints });

const placeAnOrder: ProposedEntryPoint = {
  id: 'place-an-order',
  name: 'A shopper places an order from the checkout screen',
  entryPoint: { kind: 'screen', file: SCREEN_FILE, line: 12 },
};

const refundAnOrder: ProposedEntryPoint = {
  id: 'refund-an-order',
  name: 'An admin refunds an order',
  entryPoint: { kind: 'route', file: CONTROLLER_FILE, line: 41 },
};

describe('readDiscoveryAnswer', () => {
  it('reads every proposed entry point anchored to a file the reference graph knows', () => {
    const read = readDiscoveryAnswer(answer(placeAnOrder, refundAnOrder), { referenceGraph });
    expect(read.proposals).toEqual([placeAnOrder, refundAnOrder]);
    expect(read.rejections).toEqual([]);
  });

  it('rejects a proposed entry point anchored to a file the reference graph does not know', () => {
    const invented = {
      ...refundAnOrder,
      entryPoint: { ...refundAnOrder.entryPoint, file: 'app/controllers/invented.rb' },
    };
    const read = readDiscoveryAnswer(answer(placeAnOrder, invented), { referenceGraph });
    expect(read.proposals).toEqual([placeAnOrder]);
    expect(read.rejections).toEqual([
      {
        at: 'proposedEntryPoints[1].entryPoint.file',
        id: 'refund-an-order',
        code: 'unknown-file',
        message: expect.stringContaining('app/controllers/invented.rb') as unknown,
      },
    ]);
  });

  it('rejects an id that is not a kebab-case slug, because a flow id names a file', () => {
    const read = readDiscoveryAnswer(answer({ ...placeAnOrder, id: '../Place Order' }), {
      referenceGraph,
    });
    expect(read.proposals).toEqual([]);
    expect(read.rejections.map((rejection) => [rejection.at, rejection.code])).toEqual([
      ['proposedEntryPoints[0].id', 'invalid-flow-id'],
    ]);
  });

  it('rejects the second proposal that takes an id already proposed', () => {
    const read = readDiscoveryAnswer(
      answer(placeAnOrder, { ...refundAnOrder, id: placeAnOrder.id }),
      { referenceGraph },
    );
    expect(read.proposals).toEqual([placeAnOrder]);
    expect(read.rejections.map((rejection) => [rejection.at, rejection.code])).toEqual([
      ['proposedEntryPoints[1].id', 'duplicate-flow-id'],
    ]);
  });

  it('rejects a field a proposed entry point does not have', () => {
    const read = readDiscoveryAnswer(answer({ ...placeAnOrder, lanes: [] }), { referenceGraph });
    expect(read.proposals).toEqual([]);
    expect(read.rejections.map((rejection) => [rejection.at, rejection.code])).toEqual([
      ['proposedEntryPoints[0].lanes', 'unknown-field'],
    ]);
  });

  it('rejects an entry point kind the flow document does not know', () => {
    const read = readDiscoveryAnswer(
      answer({ ...placeAnOrder, entryPoint: { ...placeAnOrder.entryPoint, kind: 'cron' } }),
      { referenceGraph },
    );
    expect(read.rejections.map((rejection) => [rejection.at, rejection.code])).toEqual([
      ['proposedEntryPoints[0].entryPoint.kind', 'unknown-kind'],
    ]);
  });

  it('refuses an answer that is not JSON, because the pass failed and nothing can be read', () => {
    expect(() => readDiscoveryAnswer('Here are the flows I found:', { referenceGraph })).toThrow(
      DiscoveryError,
    );
  });

  it('refuses an answer that holds no list of proposed entry points', () => {
    expect(() => readDiscoveryAnswer(JSON.stringify({ flows: [] }), { referenceGraph })).toThrow(
      DiscoveryError,
    );
  });

  it('reads a proposal that is not an object as a rejection of that proposal alone', () => {
    const read = readDiscoveryAnswer(answer('place-an-order', placeAnOrder), { referenceGraph });
    expect(read.proposals).toEqual([placeAnOrder]);
    expect(read.rejections.map((rejection) => [rejection.at, rejection.code])).toEqual([
      ['proposedEntryPoints[0]', 'not-an-object'],
    ]);
  });
});

describe('candidateOf', () => {
  it('is a flow document with the name and entry point and no lanes, nodes, or edges', () => {
    expect(candidateOf(placeAnOrder)).toEqual({
      ...placeAnOrder,
      lanes: [],
      nodes: [],
      edges: [],
    });
  });
});
