import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Core } from 'cytoscape';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Anchor } from '@archmap/canvas-model';
import {
  curatePlaceAnOrder,
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderTraceAnswer,
  placeAnOrderTraced,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type { FakeProvider } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
import { FlowCanvas } from '../src/FlowCanvas.tsx';
import type { SidecarClient } from '../src/sidecar-client.ts';

const MIXED_FIXTURE = join(import.meta.dirname, '../../sidecar/fixture');

/**
 * jsdom has no 2D canvas, and Cytoscape draws on one. A context that accepts every call and
 * answers zero lets the real renderer start, so the test drives the real graph and its events.
 */
const inertContext = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : inertContext()),
    apply: () => inertContext(),
    set: () => true,
  });

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => inertContext()) as never;
});

interface World {
  readonly repo: string;
  readonly configDir: string;
  readonly opened: string[];
}

/** A copy of the mixed repo with the checkout curated as a candidate and a key stored. */
const curatedWorld = async (): Promise<World> => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-canvas-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const configDir = mkdtempSync(join(tmpdir(), 'archmap-canvas-config-'));
  await curatePlaceAnOrder(createSidecar({ ai: { configDir } }), repo);
  return { repo, configDir, opened: [] };
};

const clientIn = (world: World, provider: FakeProvider): SidecarClient => {
  const sidecar = createSidecar({
    ai: { configDir: world.configDir, providerFor: () => provider },
    openUrl: (url) => {
      world.opened.push(url);
      return Promise.resolve();
    },
  });
  return { send: (request) => sidecar.handle(request) } as SidecarClient;
};

const openRepo = async (repo: string): Promise<HTMLElement> => {
  fireEvent.change(screen.getByLabelText('Repo folder'), { target: { value: repo } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByRole('region', { name: 'Reference graph' });
  return screen.getByRole('navigation', { name: 'Flow picker' });
};

const stepItemsIn = (canvas: HTMLElement): readonly HTMLElement[] =>
  within(within(canvas).getByRole('list', { name: 'Steps' })).getAllByRole('listitem');

const stepsIn = (canvas: HTMLElement): readonly string[] =>
  stepItemsIn(canvas).map((item) => item.textContent);

const foldedStepsIn = (canvas: HTMLElement): readonly string[] =>
  stepItemsIn(canvas)
    .filter((item) => item.classList.contains('folded'))
    .map((item) => item.textContent);

describe('the canvas in the app', () => {
  it('traces a candidate on open, lists its steps, folds a lane, and opens the editor', async () => {
    const world = await curatedWorld();
    render(
      <App
        client={clientIn(world, createFakeProvider({ answers: [placeAnOrderTraceAnswer()] }))}
      />,
    );
    const picker = await openRepo(world.repo);

    fireEvent.click(within(picker).getByRole('button', { name: /Place an order/ }));
    const trace = await screen.findByRole('region', { name: 'Trace' });
    fireEvent.click(within(trace).getByRole('button', { name: 'Estimate trace cost' }));
    const estimate = await within(trace).findByRole('status', { name: 'Estimated cost' });
    expect(estimate.textContent).toMatch(/fake-model/);
    fireEvent.click(within(trace).getByRole('button', { name: 'Run trace' }));

    const canvas = await screen.findByRole('region', { name: 'Flow canvas' });
    expect(stepsIn(canvas)).toEqual([
      '1Submit the checkout',
      '2POST /orders',
      '3OrdersController#create',
      '4Write the order row',
    ]);

    fireEvent.click(within(canvas).getByRole('button', { name: /OrdersController#create/ }));
    const panel = within(canvas).getByRole('complementary', { name: 'Selection' });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Open in editor' }));
    await waitFor(() => {
      expect(world.opened).toEqual([`vscode://file${world.repo}/${MIXED_ORDERS_CONTROLLER}:3`]);
    });

    fireEvent.click(within(canvas).getByRole('button', { name: 'Fold Shop request' }));
    expect(foldedStepsIn(canvas)).toEqual(['3OrdersController#create', '4Write the order row']);

    fireEvent.click(within(canvas).getByRole('button', { name: /OrdersController#create/ }));
    expect(foldedStepsIn(canvas)).toEqual([]);
  });

  it('reopens a traced flow from disk with no provider call', async () => {
    const world = await curatedWorld();
    const tracing = createFakeProvider({ answers: [placeAnOrderTraceAnswer()] });
    const first = render(<App client={clientIn(world, tracing)} />);
    fireEvent.click(
      within(await openRepo(world.repo)).getByRole('button', { name: /Place an order/ }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Estimate trace cost' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run trace' }));
    await screen.findByRole('region', { name: 'Flow canvas' });
    first.unmount();

    const reopening = createFakeProvider({ answers: [] });
    render(<App client={clientIn(world, reopening)} />);
    fireEvent.click(
      within(await openRepo(world.repo)).getByRole('button', { name: /Place an order/ }),
    );
    const canvas = await screen.findByRole('region', { name: 'Flow canvas' });
    expect(stepsIn(canvas)).toHaveLength(4);
    expect(reopening.counted).toEqual([]);
    expect(reopening.completed).toEqual([]);
  });
});

describe('the graph the canvas draws', () => {
  const drawn = (): { graph: Core; canvas: HTMLElement; opened: Anchor[] } => {
    const graphs: Core[] = [];
    const opened: Anchor[] = [];
    render(
      <FlowCanvas
        flow={placeAnOrderTraced()}
        onOpenAnchor={(anchor) => {
          opened.push(anchor);
        }}
        onGraph={(graph) => {
          graphs.push(graph);
        }}
      />,
    );
    const [graph] = graphs;
    if (graph === undefined) throw new Error('the canvas handed over no graph');
    return { graph, canvas: screen.getByRole('region', { name: 'Flow canvas' }), opened };
  };

  it('inks an inferred edge dashed and a verified edge solid', () => {
    const { graph } = drawn();
    expect(graph.$id('post->create').hasClass('ink-dashed')).toBe(true);
    expect(graph.$id('submit->post').hasClass('ink-solid')).toBe(true);
  });

  it('shows the evidence of an inferred edge on a click', async () => {
    const { graph, canvas } = drawn();
    graph.$id('post->create').emit('tap');
    const panel = within(canvas).getByRole('complementary', { name: 'Selection' });
    expect(await within(panel).findByText('post "/orders", to: "orders#create"')).toBeTruthy();
  });

  it('opens the editor at the anchor of a node on a click', async () => {
    const { graph, canvas, opened } = drawn();
    graph.$id('create').emit('tap');
    const panel = within(canvas).getByRole('complementary', { name: 'Selection' });
    await within(panel).findByText('OrdersController#create');
    expect(opened).toEqual([{ file: MIXED_ORDERS_CONTROLLER, line: 3 }]);
  });

  it('takes the nodes of a folded lane off the graph', () => {
    const { graph, canvas } = drawn();
    fireEvent.click(within(canvas).getByRole('button', { name: 'Fold Shop request' }));
    expect(graph.$id('create').length).toBe(0);
  });
});
