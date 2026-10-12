/**
 * The known answer of a trace over the committed mixed repo (`packages/sidecar/fixture`): the
 * checkout in the TypeScript client, one HTTP hop into the Rails app, and the order row written
 * there. Every node line is a real line of that fixture, so a fake provider can hand this back as
 * a trace answer and the validator accepts it over the graph the three extractors emit.
 */

import type { FlowDocument } from '@archmap/flow-document';

export const MIXED_CHECKOUT_SCREEN = 'web/src/screens/checkout.ts';
export const MIXED_ORDERS_CLIENT = 'web/src/api/orders-client.ts';
export const MIXED_ROUTES = 'shop/config/routes.rb';
export const MIXED_ORDERS_CONTROLLER = 'shop/app/controllers/orders_controller.rb';
export const MIXED_ORDER = 'shop/app/models/order.rb';

/** The entry point a discovery pass over the mixed repo proposes for the checkout. */
export const placeAnOrderProposal = () => ({
  id: 'place-an-order',
  name: 'Place an order from the checkout screen',
  entryPoint: { kind: 'screen' as const, file: MIXED_CHECKOUT_SCREEN, line: 3 },
});

export const placeAnOrderTraced = (): FlowDocument => ({
  ...placeAnOrderProposal(),
  lanes: [
    { id: 'web', name: 'Web client' },
    { id: 'shop', name: 'Shop request' },
  ],
  nodes: [
    {
      id: 'submit',
      kind: 'step',
      label: 'Submit the checkout',
      lane: 'web',
      file: MIXED_CHECKOUT_SCREEN,
      line: 4,
    },
    {
      id: 'post',
      kind: 'step',
      label: 'POST /orders',
      lane: 'web',
      file: MIXED_ORDERS_CLIENT,
      line: 2,
    },
    {
      id: 'create',
      kind: 'step',
      label: 'OrdersController#create',
      lane: 'shop',
      file: MIXED_ORDERS_CONTROLLER,
      line: 3,
    },
    {
      id: 'write',
      kind: 'side-effect',
      label: 'Write the order row',
      lane: 'shop',
      file: MIXED_ORDER,
      line: 3,
    },
  ],
  edges: [
    { kind: 'verified', from: 'submit', to: 'post' },
    {
      kind: 'inferred',
      from: 'post',
      to: 'create',
      boundary: 'http',
      evidence: { quote: 'post "/orders", to: "orders#create"', file: MIXED_ROUTES, line: 2 },
    },
    { kind: 'verified', from: 'create', to: 'write' },
  ],
});

/** What a trace pass answers for the checkout: the traced flow without the identity it keeps. */
export const placeAnOrderTraceAnswer = (): string => {
  const { lanes, nodes, edges } = placeAnOrderTraced();
  return JSON.stringify({ lanes, nodes, edges });
};
