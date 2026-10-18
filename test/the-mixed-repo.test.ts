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
import { referenceGraphFromDocuments } from '@archmap/reference-graph';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { createSidecar } from '@archmap/sidecar';
import type { ExtractResult, OpenResult } from '@archmap/sidecar';
import {
  MIXED_CHECKOUT_SCREEN,
  MIXED_ORDER,
  MIXED_ORDERS_CLIENT,
  MIXED_ORDERS_CONTROLLER,
  MIXED_ROUTES,
  placeAnOrderTraced,
} from '@archmap/testing';

const MIXED_FIXTURE = fileURLToPath(new URL('../packages/sidecar/fixture', import.meta.url));

const lineOf = (path: string, line: number): string =>
  readFileSync(join(MIXED_FIXTURE, path), 'utf8').split('\n')[line - 1] ?? '';

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
    expect(lineOf(MIXED_ROUTES, 2).trim()).toBe('post "/orders", to: "orders#create"');
  });

  it('anchors each node to the line that does the step', () => {
    expect(lineOf(MIXED_CHECKOUT_SCREEN, 4)).toContain('placeOrder(cart)');
    expect(lineOf(MIXED_ORDERS_CLIENT, 2)).toContain("fetch('/orders'");
    expect(lineOf(MIXED_ORDERS_CONTROLLER, 3)).toContain('Order.place');
    expect(lineOf(MIXED_ORDER, 3)).toContain('create!');
  });

  it('is accepted over the merged graph with an inferred HTTP edge that carries evidence', () => {
    expect(validateFlowDocument(placeAnOrderTraced(), { referenceGraph })).toEqual({
      ok: true,
      document: placeAnOrderTraced(),
    });
  });

  it('is refused when the HTTP hop is claimed as verified across the two lanes', () => {
    const flow = placeAnOrderTraced();
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
    const flow = placeAnOrderTraced();
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
