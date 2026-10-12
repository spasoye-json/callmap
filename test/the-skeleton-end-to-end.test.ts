/**
 * The walking skeleton's proof, driven the way the app drives it: through the sidecar command
 * surface, with a fake provider, over a copy of the committed mixed repo. The checkout is opened,
 * extracted, discovered, curated, traced and stamped, and a later change to an anchored file is
 * read back as a stale mark (ADR-0005, ADR-0008).
 *
 * The traced flow is the cross-language finish line: a TypeScript lane and a Ruby lane that only
 * an inferred boundary edge joins, and that edge quotes the route it rests on (ADR-0004, ADR-0009).
 */

import { appendFileSync, cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCanvasModel } from '@archmap/canvas-model';
import { isInferredEdge } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import { referenceGraphFromDocuments } from '@archmap/reference-graph';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type {
  DiscoverResult,
  ExtractResult,
  MapResult,
  OpenResult,
  TraceResult,
} from '@archmap/sidecar';
import {
  MIXED_CHECKOUT_SCREEN,
  MIXED_ORDER,
  MIXED_ORDERS_CLIENT,
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
  placeAnOrderTraced,
} from '@archmap/testing';

const MIXED_FIXTURE = fileURLToPath(new URL('../packages/sidecar/fixture', import.meta.url));

const discoveryAnswer = JSON.stringify({ proposedEntryPoints: [placeAnOrderProposal()] });

const lineOf = (repo: string, path: string, line: number): string =>
  readFileSync(join(repo, path), 'utf8').split('\n')[line - 1] ?? '';

const languagesOfLanes = (
  flow: FlowDocument,
  graph: ReferenceGraph,
): Record<string, readonly (string | undefined)[]> =>
  Object.fromEntries(
    flow.lanes.map((lane) => [
      lane.id,
      [
        ...new Set(
          flow.nodes
            .filter((node) => node.lane === lane.id)
            .map((node) => graph.languageOf(node.file)),
        ),
      ],
    ]),
  );

const theWholeLife = async () => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-skeleton-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const provider = createFakeProvider({ answers: [discoveryAnswer, placeAnOrderTraceAnswer()] });
  const sidecar = createSidecar({
    ai: {
      configDir: mkdtempSync(join(tmpdir(), 'archmap-skeleton-config-')),
      providerFor: () => provider,
      now: () => new Date('2026-10-12T09:00:00Z'),
    },
  });
  const send = async <Result>(request: Record<string, unknown>): Promise<Result> => {
    const response = await sidecar.handle(request);
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
    return response.result as Result;
  };

  const opened = await send<OpenResult>({ command: 'open', repo, scope: [] });
  const extracted = await send<ExtractResult>({
    command: 'extract',
    repo: opened.repo,
    scope: opened.scope,
    languages: opened.languages,
  });
  const { documents } = extracted;
  await send({ command: 'set-key', key: 'sk-ant-test' });
  const discovered = await send<DiscoverResult>({ command: 'discover', repo, documents });
  const curated = await send<MapResult>({
    command: 'curate',
    repo,
    documents,
    accept: discovered.proposals,
    reject: [],
  });
  const traced = await send<TraceResult>({
    command: 'trace',
    repo,
    documents,
    flowId: 'place-an-order',
  });
  const afterTrace = await send<MapResult>({ command: 'map', repo, documents });
  appendFileSync(join(repo, MIXED_ORDER), '# touched after the trace\n');
  const afterTouch = await send<MapResult>({ command: 'map', repo, documents });

  return {
    repo,
    provider,
    opened,
    extracted,
    discovered,
    curated,
    traced,
    afterTrace,
    afterTouch,
    graph: referenceGraphFromDocuments(...documents),
  };
};

let life: Awaited<ReturnType<typeof theWholeLife>>;

/** One life runs once: every test reads a stage of it, in the order the app reaches them. */
beforeAll(async () => {
  life = await theWholeLife();
});

describe('the walking skeleton over the mixed repo, from open to the stale mark', () => {
  it('opens the repo in three languages and merges one reference graph', () => {
    const { opened, extracted } = life;
    expect(opened.languages).toEqual(['go', 'ruby', 'typescript']);
    expect(extracted.summary.languages.map((language) => language.language)).toEqual([
      'go',
      'ruby',
      'typescript',
    ]);
  });

  it('discovers the checkout and curates it into a candidate', () => {
    const { discovered, curated } = life;
    expect(discovered.proposals).toEqual([placeAnOrderProposal()]);
    expect(curated.flows).toEqual([{ ...placeAnOrderProposal(), lanes: [], nodes: [], edges: [] }]);
    expect(curated.marks).toEqual([{ flowId: 'place-an-order', state: 'candidate', reasons: [] }]);
  });

  it('traces the candidate into the known flow and reads it back fresh', () => {
    const { traced, afterTrace } = life;
    expect(traced.flow).toEqual(placeAnOrderTraced());
    expect(afterTrace.flows).toEqual([placeAnOrderTraced()]);
    expect(afterTrace.refused).toEqual([]);
    expect(afterTrace.marks).toEqual([{ flowId: 'place-an-order', state: 'fresh', reasons: [] }]);
  });

  it('marks the flow stale once an anchored file changes, with no second trace', () => {
    const { provider, afterTouch } = life;
    expect(afterTouch.flows).toEqual([placeAnOrderTraced()]);
    expect(afterTouch.marks).toEqual([
      {
        flowId: 'place-an-order',
        state: 'stale',
        reasons: [{ code: 'changed', file: MIXED_ORDER }],
      },
    ]);
    expect(provider.completed).toHaveLength(2);
  });
});

describe('the traced flow across the language line', () => {
  it('draws a TypeScript lane and a Ruby lane', () => {
    const { traced, graph } = life;
    expect(languagesOfLanes(traced.flow, graph)).toEqual({
      web: ['typescript'],
      shop: ['ruby'],
    });
    expect(buildCanvasModel(traced.flow).lanes.map((lane) => lane.id)).toEqual(['web', 'shop']);
  });

  it('joins the two lanes only by inferred edges, drawn dashed', () => {
    const { traced } = life;
    const model = buildCanvasModel(traced.flow);
    const laneOf = new Map(model.nodes.map((node) => [node.id, node.lane]));
    const crossing = model.edges.filter((edge) => laneOf.get(edge.from) !== laneOf.get(edge.to));
    expect(crossing.map((edge) => [edge.from, edge.to, edge.kind, edge.ink])).toEqual([
      ['post', 'create', 'inferred', 'dashed'],
    ]);
  });

  it('gives every boundary edge evidence that quotes the repo line it names', () => {
    const { traced, repo } = life;
    const boundaries = traced.flow.edges.filter(isInferredEdge);
    expect(boundaries).toHaveLength(1);
    for (const edge of boundaries) {
      expect(edge.boundary).toBe('http');
      expect(lineOf(repo, edge.evidence.file, edge.evidence.line)).toContain(edge.evidence.quote);
    }
  });

  it('anchors each lane to files of its own language', () => {
    const { traced, graph } = life;
    expect(traced.flow.nodes.map((node) => [node.file, graph.languageOf(node.file)])).toEqual([
      [MIXED_CHECKOUT_SCREEN, 'typescript'],
      [MIXED_ORDERS_CLIENT, 'typescript'],
      [MIXED_ORDERS_CONTROLLER, 'ruby'],
      [MIXED_ORDER, 'ruby'],
    ]);
  });
});
