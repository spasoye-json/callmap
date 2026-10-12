/**
 * The committed mixed repo read the way the app reads it: the sidecar opens it, runs the three
 * extractors, and merges their documents into one reference graph. Over that graph, one flow from
 * the TypeScript client into the Rails app is accepted with an inferred HTTP edge that quotes the
 * route, and refused when the same hop is claimed as verified (ADR-0004, ADR-0009).
 *
 * Every node line here is a real line of the fixture, so the trace that later runs over this repo
 * has a known answer to be held to.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateFlowDocument } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import { referenceGraphFromDocuments } from '@archmap/reference-graph';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { createSidecar } from '@archmap/sidecar';
import type { ExtractResult, OpenResult } from '@archmap/sidecar';

const MIXED_FIXTURE = fileURLToPath(new URL('../packages/sidecar/fixture', import.meta.url));

const CHECKOUT_SCREEN = 'web/src/screens/checkout.ts';
const ORDERS_CLIENT = 'web/src/api/orders-client.ts';
const ROUTES = 'shop/config/routes.rb';
const ORDERS_CONTROLLER = 'shop/app/controllers/orders_controller.rb';
const ORDER = 'shop/app/models/order.rb';

const lineOf = (path: string, line: number): string =>
  readFileSync(join(MIXED_FIXTURE, path), 'utf8').split('\n')[line - 1] ?? '';

const placeAnOrder = (): FlowDocument => ({
  id: 'place-an-order',
  name: 'Place an order from the checkout screen',
  entryPoint: { kind: 'screen', file: CHECKOUT_SCREEN, line: 3 },
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
      file: CHECKOUT_SCREEN,
      line: 4,
    },
    { id: 'post', kind: 'step', label: 'POST /orders', lane: 'web', file: ORDERS_CLIENT, line: 2 },
    {
      id: 'create',
      kind: 'step',
      label: 'OrdersController#create',
      lane: 'shop',
      file: ORDERS_CONTROLLER,
      line: 3,
    },
    {
      id: 'write',
      kind: 'side-effect',
      label: 'Write the order row',
      lane: 'shop',
      file: ORDER,
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
      evidence: { quote: 'post "/orders", to: "orders#create"', file: ROUTES, line: 2 },
    },
    { kind: 'verified', from: 'create', to: 'write' },
  ],
});

let referenceGraph: ReferenceGraph;

beforeAll(async () => {
  const sidecar = createSidecar();
  const opened = await sidecar.handle({ command: 'open', repo: MIXED_FIXTURE, scope: [] });
  if (!opened.ok) throw new Error(opened.error.message);
  const { languages } = opened.result as OpenResult;
  const extracted = await sidecar.handle({
    command: 'extract',
    repo: MIXED_FIXTURE,
    scope: [],
    languages,
  });
  if (!extracted.ok) throw new Error(extracted.error.message);
  referenceGraph = referenceGraphFromDocuments(...(extracted.result as ExtractResult).documents);
});

describe('a flow from the TypeScript client into the Rails app', () => {
  it('quotes the route exactly as the fixture writes it', () => {
    expect(lineOf(ROUTES, 2).trim()).toBe('post "/orders", to: "orders#create"');
  });

  it('anchors each node to the line that does the step', () => {
    expect(lineOf(CHECKOUT_SCREEN, 4)).toContain('placeOrder(cart)');
    expect(lineOf(ORDERS_CLIENT, 2)).toContain("fetch('/orders'");
    expect(lineOf(ORDERS_CONTROLLER, 3)).toContain('Order.place');
    expect(lineOf(ORDER, 3)).toContain('create!');
  });

  it('is accepted over the merged graph with an inferred HTTP edge that carries evidence', () => {
    expect(validateFlowDocument(placeAnOrder(), { referenceGraph })).toEqual({
      ok: true,
      document: placeAnOrder(),
    });
  });

  it('is refused when the HTTP hop is claimed as verified across the two lanes', () => {
    const flow = placeAnOrder();
    const claimed = {
      ...flow,
      edges: flow.edges.map((edge, index) =>
        index === 1 ? { kind: 'verified', from: 'post', to: 'create' } : edge,
      ),
    };
    const result = validateFlowDocument(claimed, { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([
      'boundary-edge-claims-verified',
    ]);
  });

  it('is refused when the HTTP hop is drawn in one lane and claimed as verified', () => {
    const flow = placeAnOrder();
    const oneLane = {
      ...flow,
      nodes: flow.nodes.map((node) => ({ ...node, lane: 'web' })),
      edges: flow.edges.map((edge, index) =>
        index === 1 ? { kind: 'verified', from: 'post', to: 'create' } : edge,
      ),
    };
    const result = validateFlowDocument(oneLane, { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([
      'verified-edge-crosses-language',
    ]);
  });
});
