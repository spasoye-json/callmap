/**
 * The whole core in one pass: two extractors emit a reference graph, the validator accepts a
 * candidate and a traced cross-language flow against it, the library lists both, staleness marks
 * one stale, and the canvas model draws it.
 *
 * Nothing in this test opens a file of the repo it describes. The extractor output and the file
 * hashes are data, which is the contract the whole core is built on.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyReferenceGraph,
  mergeReferenceGraphs,
  ReferenceGraphError,
} from '@archmap/reference-graph';
import { parseFlowDocument, validateFlowDocument } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import { buildFlowPicker, createFlowLibrary } from '@archmap/flow-library';
import {
  applyStamps,
  markFlows,
  parseAnchorStore,
  readsAsFresh,
  repoSnapshot,
  serialiseAnchorStore,
  StalenessError,
  unreadableRepo,
} from '@archmap/staleness';
import { buildCanvasModel, evidenceOf } from '@archmap/canvas-model';

const SCREEN = 'app/screens/checkout.tsx';
const CLIENT = 'app/api/orders-client.ts';
const CONTROLLER = 'app/controllers/orders_controller.rb';
const MODEL = 'app/models/order.rb';

/** What the TypeScript extractor emitted over the mobile subtree. */
const typescriptGraph = {
  files: [
    { path: SCREEN, language: 'typescript' },
    { path: CLIENT, language: 'typescript' },
  ],
  edges: [{ from: SCREEN, to: CLIENT }],
};

/** What the Ruby extractor emitted over the Rails app. */
const rubyGraph = {
  files: [
    { path: CONTROLLER, language: 'ruby' },
    { path: MODEL, language: 'ruby' },
  ],
  edges: [{ from: CONTROLLER, to: MODEL }],
};

const referenceGraph = mergeReferenceGraphs(typescriptGraph, rubyGraph);

const tracedFlow: unknown = {
  id: 'place-an-order',
  name: 'Place an order',
  entryPoint: { kind: 'screen', file: SCREEN, line: 12 },
  lanes: [
    { id: 'mobile', name: 'Mobile app' },
    { id: 'backend', name: 'Backend request' },
  ],
  nodes: [
    { id: 'tap', kind: 'step', label: 'Tap Place order', lane: 'mobile', file: SCREEN, line: 12 },
    { id: 'post', kind: 'step', label: 'POST /orders', lane: 'mobile', file: CLIENT, line: 8 },
    {
      id: 'create',
      kind: 'step',
      label: 'OrdersController#create',
      lane: 'backend',
      file: CONTROLLER,
      line: 14,
    },
    {
      id: 'write',
      kind: 'side-effect',
      label: 'Write the row',
      lane: 'backend',
      file: MODEL,
      line: 30,
    },
  ],
  edges: [
    { kind: 'verified', from: 'tap', to: 'post' },
    {
      kind: 'inferred',
      from: 'post',
      to: 'create',
      boundary: 'http',
      evidence: { quote: "post '/orders', to: 'orders#create'", file: CONTROLLER, line: 13 },
    },
    { kind: 'verified', from: 'create', to: 'write' },
  ],
};

const discoveredCandidate: unknown = {
  id: 'refund-an-order',
  name: 'Refund an order',
  entryPoint: { kind: 'route', file: CONTROLLER, line: 41 },
  lanes: [],
  nodes: [],
  edges: [],
};

const accept = (value: unknown): FlowDocument => {
  const result = validateFlowDocument(value, { referenceGraph });
  expect(result.ok ? [] : result.errors).toEqual([]);
  if (!result.ok) throw new Error('unreachable');
  return result.document;
};

const hashes = {
  [SCREEN]: 'screen-1',
  [CLIENT]: 'client-1',
  [CONTROLLER]: 'controller-1',
  [MODEL]: 'model-1',
};

describe('the core, end to end', () => {
  it('merges one reference graph out of two extractors', () => {
    expect(referenceGraph.files).toHaveLength(4);
    expect(referenceGraph.joins(SCREEN, CLIENT)).toBe(true);
    expect(referenceGraph.joins(CLIENT, CONTROLLER)).toBe(false);
  });

  it('accepts the traced cross-language flow against it', () => {
    expect(accept(tracedFlow).nodes).toHaveLength(4);
  });

  it('accepts the discovered candidate against it', () => {
    expect(accept(discoveredCandidate).nodes).toEqual([]);
  });

  it('refuses the same flow when the HTTP hop claims to be verified', () => {
    const forged = {
      ...(tracedFlow as Record<string, unknown>),
      edges: [
        { kind: 'verified', from: 'tap', to: 'post' },
        { kind: 'verified', from: 'post', to: 'create' },
        { kind: 'verified', from: 'create', to: 'write' },
      ],
    };
    const result = validateFlowDocument(forged, { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toContain(
      'boundary-edge-claims-verified',
    );
  });

  it('refuses a step in a file no extractor emitted', () => {
    const invented = {
      ...(tracedFlow as Record<string, unknown>),
      nodes: [
        {
          id: 'tap',
          kind: 'step',
          label: 'Tap Place order',
          lane: 'mobile',
          file: 'app/screens/hallucinated.tsx',
          line: 1,
        },
      ],
      edges: [],
    };
    const result = validateFlowDocument(invented, { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toContain('unknown-file');
  });

  it('lists both flows in the picker, the traced one openable and the candidate greyed out', () => {
    const library = createFlowLibrary([accept(tracedFlow), accept(discoveredCandidate)]);
    expect(buildFlowPicker(library).map((row) => [row.id, row.openable])).toEqual([
      ['place-an-order', true],
      ['refund-an-order', false],
    ]);
  });

  it('reads a stamped flow as fresh and badges nothing', () => {
    const documents = [accept(tracedFlow), accept(discoveredCandidate)];
    const store = applyStamps({}, documents, ['place-an-order'], repoSnapshot(hashes));
    const marks = markFlows(documents, store, repoSnapshot(hashes));
    const rows = buildFlowPicker(createFlowLibrary(documents), marks);
    expect(rows.map((row) => [row.id, row.staleness, row.badge])).toEqual([
      ['place-an-order', 'fresh', null],
      ['refund-an-order', 'candidate', null],
    ]);
  });

  it('badges the flow stale once a file in its anchor set changes in the working tree', () => {
    const documents = [accept(tracedFlow), accept(discoveredCandidate)];
    const store = applyStamps({}, documents, ['place-an-order'], repoSnapshot(hashes));
    const afterTheEdit = repoSnapshot({ ...hashes, [MODEL]: 'model-2' });
    const marks = markFlows(documents, store, afterTheEdit);
    const row = buildFlowPicker(createFlowLibrary(documents), marks).find(
      (candidate) => candidate.id === 'place-an-order',
    );
    expect(row?.badge).toBe('stale');
    expect(marks[0]?.reasons).toEqual([{ code: 'changed', file: MODEL }]);
  });

  it('carries the flow document through the committed file unchanged', () => {
    const written = `${JSON.stringify(accept(tracedFlow), null, 2)}\n`;
    const read = parseFlowDocument(written, { referenceGraph });
    expect(read.ok ? read.document : read.errors).toEqual(accept(tracedFlow));
  });

  it('carries the stamps through the committed file unchanged', () => {
    const documents = [accept(tracedFlow)];
    const store = applyStamps({}, documents, ['place-an-order'], repoSnapshot(hashes));
    expect(parseAnchorStore(serialiseAnchorStore(store))).toEqual(store);
  });

  it('draws the flow with the boundary hop dashed and its evidence readable', () => {
    const model = buildCanvasModel(accept(tracedFlow));
    const boundary = model.edges.find((edge) => edge.kind === 'inferred');
    expect(boundary?.ink).toBe('dashed');
    expect(boundary && evidenceOf(boundary).map((item) => item.quote)).toEqual([
      "post '/orders', to: 'orders#create'",
    ]);
  });

  it('draws every verified hop solid', () => {
    const model = buildCanvasModel(accept(tracedFlow));
    expect(model.edges.filter((edge) => edge.ink === 'solid')).toHaveLength(2);
  });

  it('draws the candidate as an empty canvas that still knows its name', () => {
    const model = buildCanvasModel(accept(discoveredCandidate));
    expect(model.traced).toBe(false);
    expect(model.nodes).toEqual([]);
    expect(model.flowName).toBe('Refund an order');
  });

  it('collapses the backend lane down to one band', () => {
    const model = buildCanvasModel(accept(tracedFlow), { collapsedLanes: ['backend'] });
    expect(model.nodes.map((node) => node.id)).toEqual(['tap', 'post', 'lane:backend']);
    expect(model.edges.map((edge) => edge.id)).toEqual(['tap->post', 'post->lane:backend']);
  });

  it('says on the lane which id its band is drawn under, so no reader composes one', () => {
    const model = buildCanvasModel(accept(tracedFlow), { collapsedLanes: ['backend'] });
    const lane = model.lanes.find((candidate) => candidate.id === 'backend');
    const band = model.nodes.find((node) => node.kind === 'lane-summary');
    expect(lane?.summaryId).toBe(band?.id);
  });
});

/**
 * The same walk again, along the paths where something is wrong. A reader is judging a change before
 * it merges, so every one of these has to read as what it is rather than as a checked pass.
 */
describe('the core, end to end, when something is wrong', () => {
  const library = createFlowLibrary([accept(tracedFlow), accept(discoveredCandidate)]);
  const documents = library.documents();
  const stamped = applyStamps({}, documents, ['place-an-order'], repoSnapshot(hashes));

  it('refuses the output of an extractor that cannot form a graph, so no graph exists to validate against', () => {
    expect(() => mergeReferenceGraphs(typescriptGraph, {} as never)).toThrow(ReferenceGraphError);
  });

  it('rejects every claim about a repo no extractor has run over', () => {
    const result = validateFlowDocument(tracedFlow, { referenceGraph: emptyReferenceGraph() });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toContain('unknown-file');
  });

  it('badges every traced flow unknown when the host could not read the repo', () => {
    const marks = markFlows(documents, stamped, unreadableRepo('the working tree is mid-rebase'));
    const rows = buildFlowPicker(library, marks);
    expect(rows.map((row) => [row.id, row.badge])).toEqual([
      ['place-an-order', 'unknown'],
      ['refund-an-order', null],
    ]);
  });

  it('reads nothing as fresh when the host could not read the repo', () => {
    const marks = markFlows(documents, stamped, unreadableRepo('the working tree is mid-rebase'));
    expect(marks.filter(readsAsFresh)).toEqual([]);
  });

  it('badges a traced flow nobody stamped, so a missing stamp is never a checked one', () => {
    const marks = markFlows(documents, {}, repoSnapshot(hashes));
    const rows = buildFlowPicker(library, marks);
    expect(rows.map((row) => [row.id, row.badge])).toEqual([
      ['place-an-order', 'unstamped'],
      ['refund-an-order', null],
    ]);
  });

  it('marks a flow stale, naming the file, when an anchored file leaves the working tree', () => {
    const { [MODEL]: _gone, ...rest } = hashes;
    const marks = markFlows(documents, stamped, repoSnapshot(rest));
    expect(marks[0]?.reasons).toEqual([{ code: 'gone', file: MODEL }]);
  });

  it('refuses a blanket stamp, which would mint a fresh mark for a trace nobody checked', () => {
    expect(() => applyStamps({}, documents, [], repoSnapshot(hashes))).toThrow(StalenessError);
  });

  it('refuses to stamp the candidate, which has read no files', () => {
    expect(() => applyStamps({}, documents, ['refund-an-order'], repoSnapshot(hashes))).toThrow(
      StalenessError,
    );
  });

  it('refuses to stamp over a mark the reader has not cleared by hand', () => {
    expect(() => applyStamps(stamped, documents, ['place-an-order'], repoSnapshot(hashes))).toThrow(
      StalenessError,
    );
  });

  it('reads the flow fresh again once a re-stamp is asked for by hand', () => {
    const changed = { ...hashes, [MODEL]: 'hash-of-the-edited-model' };
    const restamped = applyStamps(stamped, documents, ['place-an-order'], repoSnapshot(changed), {
      restamp: true,
    });
    const marks = markFlows(documents, restamped, repoSnapshot(changed));
    expect(marks.filter(readsAsFresh).map((mark) => mark.flowId)).toEqual(['place-an-order']);
  });

  it('refuses a flow document the host caught half written, rather than throwing', () => {
    const written = JSON.stringify(accept(tracedFlow));
    const result = parseFlowDocument(written.slice(0, written.length - 20), { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual(['invalid-json']);
  });

  it('refuses an empty flow document file, which is what a half-written one starts as', () => {
    const result = parseFlowDocument('', { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual(['invalid-json']);
  });

  it('refuses a committed anchor file that is not a stamp per flow', () => {
    expect(() => parseAnchorStore('["place-an-order"]')).toThrow(StalenessError);
  });

  it('refuses a committed anchor file that is not JSON at all', () => {
    expect(() => parseAnchorStore('')).toThrow(StalenessError);
  });
});
