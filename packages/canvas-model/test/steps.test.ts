import { describe, expect, it } from 'vitest';
import { candidate, checkoutFlow, CONTROLLER_FILE, SCREEN_FILE } from '@archmap/testing';
import type { FlowDocument } from '@archmap/flow-document';
import { buildCanvasModel } from '../src/index.ts';

describe('the ordered step list', () => {
  it('lists every node in the order the flow runs', () => {
    expect(buildCanvasModel(checkoutFlow()).steps.map((step) => step.id)).toEqual([
      'tap-checkout',
      'post-order',
      'receive-order',
      'check-cart',
      'persist-order',
      'reject-empty-cart',
      'emit-order-placed',
      'send-receipt',
    ]);
  });
});

describe('a step in the list', () => {
  const steps = buildCanvasModel(checkoutFlow()).steps;

  it('is numbered from one', () => {
    expect(steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('carries its kind, label, lane, and anchor', () => {
    expect(steps[3]).toMatchObject({
      kind: 'decision',
      label: 'Is the cart empty?',
      lane: 'backend',
      anchor: { file: CONTROLLER_FILE, line: 20 },
    });
  });
});

describe('two steps at the same point of the flow', () => {
  it('lists the step of the lane declared first before the other', () => {
    const flow: FlowDocument = {
      ...candidate(),
      lanes: [
        { id: 'first', name: 'First' },
        { id: 'second', name: 'Second' },
      ],
      nodes: [
        { id: 'alpha', kind: 'step', label: 'Alpha', lane: 'second', file: SCREEN_FILE, line: 1 },
        { id: 'zed', kind: 'step', label: 'Zed', lane: 'first', file: SCREEN_FILE, line: 2 },
      ],
    };
    expect(buildCanvasModel(flow).steps.map((step) => step.id)).toEqual(['zed', 'alpha']);
  });
});

describe('the step list with a lane folded', () => {
  const steps = buildCanvasModel(checkoutFlow(), { collapsedLanes: ['backend'] }).steps;

  it('still lists every step, so folding never hides a step from the list', () => {
    expect(steps).toHaveLength(8);
  });

  it('marks the steps of the folded lane as folded and no others', () => {
    expect(steps.filter((step) => step.folded).map((step) => step.id)).toEqual([
      'receive-order',
      'check-cart',
      'persist-order',
      'reject-empty-cart',
      'emit-order-placed',
    ]);
  });
});

describe('the step list of a candidate', () => {
  it('is empty, because a candidate has no nodes yet', () => {
    expect(buildCanvasModel(candidate()).steps).toEqual([]);
  });
});
