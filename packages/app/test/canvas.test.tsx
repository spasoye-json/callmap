// @vitest-environment jsdom
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Core } from 'cytoscape';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type { ExtractResult, FakeProvider, OpenResult } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
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

afterEach(cleanup);

/** The Cytoscape instance drawn into a container, where Cytoscape registers it. */
const graphIn = (container: HTMLElement): Core => {
  const registered = (container as HTMLElement & { _cyreg?: { cy?: Core } })._cyreg?.cy;
  if (registered === undefined) throw new Error('no graph is drawn in the canvas');
  return registered;
};

interface World {
  readonly repo: string;
  readonly configDir: string;
  readonly opened: string[];
}

/** A copy of the mixed repo with the checkout curated as a candidate and a key stored. */
const world = async (): Promise<World> => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-canvas-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const configDir = mkdtempSync(join(tmpdir(), 'archmap-canvas-config-'));
  const sidecar = createSidecar({ ai: { configDir } });
  const open = await sidecar.handle({ command: 'open', repo, scope: [] });
  if (!open.ok) throw new Error(open.error.message);
  const extract = await sidecar.handle({
    command: 'extract',
    repo,
    scope: [],
    languages: (open.result as OpenResult).languages,
  });
  if (!extract.ok) throw new Error(extract.error.message);
  const { documents } = extract.result as ExtractResult;
  await sidecar.handle({ command: 'set-key', key: 'sk-ant-test' });
  await sidecar.handle({
    command: 'curate',
    repo,
    documents,
    accept: [placeAnOrderProposal()],
    reject: [],
  });
  return { repo, configDir, opened: [] };
};

const clientIn = (at: World, provider: FakeProvider): SidecarClient => {
  const sidecar = createSidecar({
    ai: { configDir: at.configDir, providerFor: () => provider },
    openUrl: (url) => {
      at.opened.push(url);
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

const stepsIn = (canvas: HTMLElement): readonly string[] =>
  within(within(canvas).getByRole('list', { name: 'Steps' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('the canvas', () => {
  it('traces a candidate on open, draws it, folds a lane, and opens the editor on a node click', async () => {
    const at = await world();
    render(
      <App client={clientIn(at, createFakeProvider({ answers: [placeAnOrderTraceAnswer()] }))} />,
    );
    const picker = await openRepo(at.repo);

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
    const graph = graphIn(within(canvas).getByTestId('cytoscape'));
    expect(graph.$id('post->create').hasClass('ink-dashed')).toBe(true);
    expect(graph.$id('submit->post').hasClass('ink-solid')).toBe(true);

    graph.$id('post->create').emit('tap');
    const panel = within(canvas).getByRole('complementary', { name: 'Selection' });
    expect(await within(panel).findByText('post "/orders", to: "orders#create"')).toBeTruthy();

    graph.$id('create').emit('tap');
    await within(panel).findByText('OrdersController#create');
    expect(at.opened).toEqual([`vscode://file${at.repo}/${MIXED_ORDERS_CONTROLLER}:3`]);

    fireEvent.click(within(canvas).getByRole('button', { name: 'Fold Shop request' }));
    expect(graph.$id('create').length).toBe(0);
    const folded = within(within(canvas).getByRole('list', { name: 'Steps' }))
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('folded'))
      .map((item) => item.textContent);
    expect(folded).toEqual(['3OrdersController#create', '4Write the order row']);

    fireEvent.click(within(canvas).getByRole('button', { name: /OrdersController#create/ }));
    expect(graph.$id('create').length).toBe(1);
  });

  it('reopens a traced flow from disk with no provider call', async () => {
    const at = await world();
    const tracing = createFakeProvider({ answers: [placeAnOrderTraceAnswer()] });
    const first = render(<App client={clientIn(at, tracing)} />);
    fireEvent.click(
      within(await openRepo(at.repo)).getByRole('button', { name: /Place an order/ }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Estimate trace cost' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run trace' }));
    await screen.findByRole('region', { name: 'Flow canvas' });
    first.unmount();

    const reopening = createFakeProvider({ answers: [] });
    render(<App client={clientIn(at, reopening)} />);
    fireEvent.click(
      within(await openRepo(at.repo)).getByRole('button', { name: /Place an order/ }),
    );
    const canvas = await screen.findByRole('region', { name: 'Flow canvas' });
    expect(stepsIn(canvas)).toHaveLength(4);
    expect(reopening.counted).toEqual([]);
    expect(reopening.completed).toEqual([]);
  });
});
