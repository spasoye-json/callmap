import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MIXED_CHECKOUT_SCREEN,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
  placeAnOrderTraced,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type {
  EstimateResult,
  ExtractResult,
  FakeProvider,
  MapResult,
  OpenResult,
  TraceResult,
} from '@archmap/sidecar';

const MIXED_FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const candidate = { ...placeAnOrderProposal(), lanes: [], nodes: [], edges: [] };

let documents: ExtractResult['documents'];

/** The extractors run once: every test takes their documents back, as the app does. */
beforeAll(async () => {
  const sidecar = createSidecar();
  const open = await sidecar.handle({ command: 'open', repo: MIXED_FIXTURE, scope: [] });
  if (!open.ok) throw new Error(open.error.message);
  const extract = await sidecar.handle({
    command: 'extract',
    repo: MIXED_FIXTURE,
    scope: [],
    languages: (open.result as OpenResult).languages,
  });
  if (!extract.ok) throw new Error(extract.error.message);
  documents = (extract.result as ExtractResult).documents;
});

interface Harness {
  readonly repo: string;
  readonly configDir: string;
  readonly provider: FakeProvider;
  send<Result>(request: Record<string, unknown>): Promise<Result>;
  refusal(request: Record<string, unknown>): Promise<{ code: string; message: string }>;
}

const harnessOn = (
  repo: string,
  configDir: string,
  answers: readonly string[],
  opened: string[] = [],
): Harness => {
  const provider = createFakeProvider({ answers });
  const sidecar = createSidecar({
    ai: { configDir, providerFor: () => provider, now: () => new Date('2026-10-12T09:00:00Z') },
    openUrl: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
  });
  return {
    repo,
    configDir,
    provider,
    send: async <Result>(request: Record<string, unknown>) => {
      const response = await sidecar.handle(request);
      if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
      return response.result as Result;
    },
    refusal: async (request) => {
      const response = await sidecar.handle(request);
      if (response.ok) throw new Error(`${String(request['command'])} was not refused`);
      return response.error;
    },
  };
};

/** A copy of the mixed repo with the checkout curated as a candidate and a key stored. */
const withCandidate = async (answers: readonly string[] = [placeAnOrderTraceAnswer()]) => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-trace-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const h = harnessOn(repo, mkdtempSync(join(tmpdir(), 'archmap-trace-config-')), answers);
  await h.send({
    command: 'curate',
    repo,
    documents,
    accept: [placeAnOrderProposal()],
    reject: [],
  });
  await h.send({ command: 'set-key', key: 'sk-ant-test' });
  return h;
};

const flowFile = (repo: string): unknown =>
  JSON.parse(readFileSync(join(repo, '.archmap/flows/place-an-order.json'), 'utf8'));

describe('the trace of a candidate', () => {
  it('estimates the cost first, without running the pass', async () => {
    const h = await withCandidate();
    const estimate = await h.send<EstimateResult>({
      command: 'estimate-trace',
      repo: h.repo,
      documents,
      flowId: 'place-an-order',
    });
    expect(estimate.estimate.model).toBe('fake-model');
    expect(estimate.estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.estimate.usd).toBeGreaterThan(0);
    expect(h.provider.completed).toEqual([]);
  });

  it('runs the pass, and saves and answers with the validated flow', async () => {
    const h = await withCandidate();
    const traced = await h.send<TraceResult>({
      command: 'trace',
      repo: h.repo,
      documents,
      flowId: 'place-an-order',
    });
    expect(traced.flow).toEqual(placeAnOrderTraced());
    expect(flowFile(h.repo)).toEqual(placeAnOrderTraced());
    expect(traced.month).toMatchObject({ month: '2026-10', passes: 1 });
    expect(traced.month.usd).toBe(traced.spent.usd);
  });

  it('sends the pass the flow it traces and the source it reads', async () => {
    const h = await withCandidate();
    await h.send({ command: 'trace', repo: h.repo, documents, flowId: 'place-an-order' });
    const [request] = h.provider.completed;
    expect(request?.prompt).toContain(`entry point: screen at ${MIXED_CHECKOUT_SCREEN}:3`);
    expect(request?.prompt).toContain('4|   const order = await placeOrder(cart);');
  });

  it('reopens the traced flow from disk with no provider call', async () => {
    const h = await withCandidate();
    await h.send({ command: 'trace', repo: h.repo, documents, flowId: 'place-an-order' });

    const reopened = harnessOn(h.repo, h.configDir, []);
    const map = await reopened.send<MapResult>({ command: 'map', repo: h.repo, documents });
    expect(map.flows).toEqual([placeAnOrderTraced()]);
    expect(reopened.provider.counted).toEqual([]);
    expect(reopened.provider.completed).toEqual([]);
  });
});

describe('a trace the sidecar refuses', () => {
  it('refuses an answer the validator refuses, keeps the candidate, and still counts the spend', async () => {
    const answer = JSON.parse(placeAnOrderTraceAnswer()) as { nodes: { file: string }[] };
    const invented = {
      ...answer,
      nodes: answer.nodes.map((node, index) =>
        index === 0 ? { ...node, file: 'web/src/screens/invented.ts' } : node,
      ),
    };
    const h = await withCandidate([JSON.stringify(invented)]);
    const refused = await h.refusal({
      command: 'trace',
      repo: h.repo,
      documents,
      flowId: 'place-an-order',
    });
    expect(refused.code).toBe('trace-refused');
    expect(refused.message).toContain('unknown-file');
    expect(flowFile(h.repo)).toEqual(candidate);
    const account = await h.send<{ month: { passes: number } }>({ command: 'account' });
    expect(account.month.passes).toBe(1);
  });

  it('refuses a flow id the map file does not hold', async () => {
    const h = await withCandidate();
    const refused = await h.refusal({ command: 'trace', repo: h.repo, documents, flowId: 'nope' });
    expect(refused.code).toBe('unknown-flow');
    expect(
      (await h.refusal({ command: 'estimate-trace', repo: h.repo, documents, flowId: 'nope' }))
        .code,
    ).toBe('unknown-flow');
  });

  it('refuses to trace a traced flow again, because its trace is already paid for', async () => {
    const h = await withCandidate();
    await h.send({ command: 'trace', repo: h.repo, documents, flowId: 'place-an-order' });
    const refused = await h.refusal({
      command: 'trace',
      repo: h.repo,
      documents,
      flowId: 'place-an-order',
    });
    expect(refused.code).toBe('already-traced');
    expect(h.provider.completed).toHaveLength(1);
  });

  it('refuses to trace before a key is stored', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'archmap-trace-repo-'));
    cpSync(MIXED_FIXTURE, repo, { recursive: true });
    const h = harnessOn(repo, mkdtempSync(join(tmpdir(), 'archmap-trace-config-')), []);
    await h.send({
      command: 'curate',
      repo,
      documents,
      accept: [placeAnOrderProposal()],
      reject: [],
    });
    expect(
      (await h.refusal({ command: 'trace', repo, documents, flowId: 'place-an-order' })).code,
    ).toBe('no-api-key');
  });
});

describe('opening the editor', () => {
  it('hands the deep link to the system opener', async () => {
    const opened: string[] = [];
    const h = harnessOn(
      MIXED_FIXTURE,
      mkdtempSync(join(tmpdir(), 'archmap-trace-config-')),
      [],
      opened,
    );
    await h.send({ command: 'open-in-editor', url: 'vscode://file/r/web/src/a.ts:3' });
    expect(opened).toEqual(['vscode://file/r/web/src/a.ts:3']);
  });

  it('refuses a link that is not an editor deep link', async () => {
    const opened: string[] = [];
    const h = harnessOn(
      MIXED_FIXTURE,
      mkdtempSync(join(tmpdir(), 'archmap-trace-config-')),
      [],
      opened,
    );
    const refused = await h.refusal({ command: 'open-in-editor', url: 'https://example.com' });
    expect(refused.code).toBe('malformed-request');
    expect(opened).toEqual([]);
  });
});
