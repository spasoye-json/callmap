import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { referenceGraphFromDocuments } from '@archmap/reference-graph';
import { createSidecar } from '@archmap/sidecar';
import type { ExtractResult, OpenResult } from '@archmap/sidecar';

/** The committed mixed repo: a TypeScript client, a Rails app, and a Go service side by side. */
const MIXED_FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const CHECKOUT_SCREEN = 'web/src/screens/checkout.ts';
const ORDERS_CLIENT = 'web/src/api/orders-client.ts';
const SHOP_APPLICATION = 'shop/config/application.rb';
const ROUTES = 'shop/config/routes.rb';
const APPLICATION_CONTROLLER = 'shop/app/controllers/application_controller.rb';
const ORDERS_CONTROLLER = 'shop/app/controllers/orders_controller.rb';
const APPLICATION_RECORD = 'shop/app/models/application_record.rb';
const ORDER = 'shop/app/models/order.rb';
const SERVER = 'inventory/cmd/server/main.go';
const STOCK = 'inventory/internal/stock/stock.go';

const sidecar = createSidecar();

const opened = async (scope: readonly string[]): Promise<OpenResult> => {
  const response = await sidecar.handle({ command: 'open', repo: MIXED_FIXTURE, scope });
  if (!response.ok) throw new Error(response.error.message);
  return response.result as OpenResult;
};

const extracted = async (scope: readonly string[]): Promise<ExtractResult> => {
  const { languages } = await opened(scope);
  const response = await sidecar.handle({
    command: 'extract',
    repo: MIXED_FIXTURE,
    scope,
    languages,
  });
  if (!response.ok) throw new Error(response.error.message);
  return response.result as ExtractResult;
};

describe('the mixed fixture', () => {
  it('opens as a repo that holds all three languages', async () => {
    expect((await opened([])).languages).toEqual(['go', 'ruby', 'typescript']);
  });

  it('opens under a scope as a repo that holds only the languages in scope', async () => {
    expect((await opened(['web/**', 'inventory/**'])).languages).toEqual(['go', 'typescript']);
  });

  it('extracts into a summary per language', async () => {
    expect((await extracted([])).summary).toEqual({
      files: 10,
      edges: 5,
      languages: [
        { language: 'go', files: 2, edges: 1 },
        { language: 'ruby', files: 6, edges: 3 },
        { language: 'typescript', files: 2, edges: 1 },
      ],
    });
  });

  it('merges into one reference graph that carries all three language tags', async () => {
    const graph = referenceGraphFromDocuments(...(await extracted([])).documents);
    expect(graph.files).toEqual([
      { path: SERVER, language: 'go' },
      { path: STOCK, language: 'go' },
      { path: APPLICATION_CONTROLLER, language: 'ruby' },
      { path: ORDERS_CONTROLLER, language: 'ruby' },
      { path: APPLICATION_RECORD, language: 'ruby' },
      { path: ORDER, language: 'ruby' },
      { path: SHOP_APPLICATION, language: 'ruby' },
      { path: ROUTES, language: 'ruby' },
      { path: ORDERS_CLIENT, language: 'typescript' },
      { path: CHECKOUT_SCREEN, language: 'typescript' },
    ]);
  });

  it('holds each reference edge inside one language', async () => {
    const graph = referenceGraphFromDocuments(...(await extracted([])).documents);
    expect(graph.edges).toEqual([
      { from: SERVER, to: STOCK },
      { from: ORDERS_CONTROLLER, to: APPLICATION_CONTROLLER },
      { from: ORDERS_CONTROLLER, to: ORDER },
      { from: ORDER, to: APPLICATION_RECORD },
      { from: CHECKOUT_SCREEN, to: ORDERS_CLIENT },
    ]);
  });

  it('joins no TypeScript file to the Rails controller its client calls over HTTP', async () => {
    const graph = referenceGraphFromDocuments(...(await extracted([])).documents);
    expect(graph.joins(ORDERS_CLIENT, ORDERS_CONTROLLER)).toBe(false);
  });
});

describe('an extractor that names a reference into another language', () => {
  it('is refused at the merge, so the reader never sees a graph that holds it', async () => {
    const crossing = createSidecar({
      extractors: [
        {
          language: 'typescript',
          claims: (path) => path.endsWith('.ts'),
          extract: (run) =>
            Promise.resolve({
              language: 'typescript',
              scope: run.scope,
              files: [ORDERS_CLIENT],
              edges: [{ from: ORDERS_CLIENT, to: ORDERS_CONTROLLER }],
            }),
        },
        {
          language: 'ruby',
          claims: (path) => path.endsWith('.rb'),
          extract: (run) =>
            Promise.resolve({
              language: 'ruby',
              scope: run.scope,
              files: [ORDERS_CONTROLLER],
              edges: [],
            }),
        },
      ],
    });
    const response = await crossing.handle({
      command: 'extract',
      repo: MIXED_FIXTURE,
      scope: [],
      languages: ['ruby', 'typescript'],
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'graph-refused' } });
  });
});
