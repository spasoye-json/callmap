import type {
  Boundary,
  Evidence,
  FlowDocument,
  InferredEdge,
  VerifiedEdge,
} from '@archmap/flow-document';
import {
  ASYNC_LANE,
  BACKEND_LANE,
  CONTROLLER_FILE,
  JOB_FILE,
  MOBILE_LANE,
  MODEL_FILE,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
} from './repo.ts';

/** A deep copy, so a test that edits a fixture cannot reach the next test. */
export const clone = <T>(value: T): T => structuredClone(value);

export const verifiedEdge = (from: string, to: string): VerifiedEdge => ({
  kind: 'verified',
  from,
  to,
});

export const inferredEdge = (
  from: string,
  to: string,
  boundary: Boundary,
  evidence: Evidence,
): InferredEdge => ({ kind: 'inferred', from, to, boundary, evidence });

/**
 * The headline fixture: one cross-language flow from the checkout screen to the receipt job. It
 * crosses two process boundaries, an HTTP call and an emitted event, and holds one node of every
 * kind.
 */
export const checkoutFlow = (): FlowDocument => ({
  id: 'checkout',
  name: 'Place an order from the checkout screen',
  entryPoint: { kind: 'screen', file: SCREEN_FILE, line: 12 },
  lanes: [
    { id: MOBILE_LANE, name: 'Mobile app' },
    { id: BACKEND_LANE, name: 'Backend request' },
    { id: ASYNC_LANE, name: 'Async listeners' },
  ],
  nodes: [
    {
      id: 'tap-checkout',
      kind: 'step',
      label: 'Reader taps Place order',
      lane: MOBILE_LANE,
      file: SCREEN_FILE,
      line: 12,
    },
    {
      id: 'post-order',
      kind: 'step',
      label: 'POST /orders',
      lane: MOBILE_LANE,
      file: ORDERS_CLIENT_FILE,
      line: 8,
    },
    {
      id: 'receive-order',
      kind: 'step',
      label: 'OrdersController#create',
      lane: BACKEND_LANE,
      file: CONTROLLER_FILE,
      line: 14,
    },
    {
      id: 'check-cart',
      kind: 'decision',
      label: 'Is the cart empty?',
      lane: BACKEND_LANE,
      file: CONTROLLER_FILE,
      line: 20,
    },
    {
      id: 'reject-empty-cart',
      kind: 'error',
      label: 'Reply 422, empty cart',
      lane: BACKEND_LANE,
      file: CONTROLLER_FILE,
      line: 24,
    },
    {
      id: 'persist-order',
      kind: 'side-effect',
      label: 'Write the order row',
      lane: BACKEND_LANE,
      file: MODEL_FILE,
      line: 30,
    },
    {
      id: 'emit-order-placed',
      kind: 'side-effect',
      label: 'Emit order.placed',
      lane: BACKEND_LANE,
      file: MODEL_FILE,
      line: 36,
    },
    {
      id: 'send-receipt',
      kind: 'side-effect',
      label: 'Send the receipt email',
      lane: ASYNC_LANE,
      file: JOB_FILE,
      line: 9,
    },
  ],
  edges: [
    verifiedEdge('tap-checkout', 'post-order'),
    inferredEdge('post-order', 'receive-order', 'http', {
      quote: "post '/orders', to: 'orders#create'",
      file: CONTROLLER_FILE,
      line: 13,
    }),
    verifiedEdge('receive-order', 'check-cart'),
    verifiedEdge('check-cart', 'reject-empty-cart'),
    verifiedEdge('check-cart', 'persist-order'),
    verifiedEdge('persist-order', 'emit-order-placed'),
    inferredEdge('emit-order-placed', 'send-receipt', 'event', {
      quote: "subscribe_to 'order.placed'",
      file: JOB_FILE,
      line: 4,
    }),
  ],
});

/** A candidate: named and anchored to an entry point, with no nodes and no edges. */
export const candidate = (
  id = 'refund-an-order',
  name = 'Refund an order from the admin screen',
): FlowDocument => ({
  id,
  name,
  entryPoint: { kind: 'route', file: CONTROLLER_FILE, line: 41 },
  lanes: [],
  nodes: [],
  edges: [],
});
