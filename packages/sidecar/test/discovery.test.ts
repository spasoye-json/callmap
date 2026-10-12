import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type {
  AccountResult,
  CurateResult,
  DiscoverResult,
  EstimateResult,
  ExtractResult,
  FakeProvider,
  MapResult,
  OpenResult,
  Sidecar,
} from '@archmap/sidecar';

const TYPESCRIPT_FIXTURE = fileURLToPath(
  new URL('../../extractor-typescript/fixture', import.meta.url),
);

const API_KEY = 'sk-ant-test-key-that-must-never-reach-the-repo';

const placeAnOrder = {
  id: 'place-an-order',
  name: 'A shopper places an order from the checkout screen',
  entryPoint: { kind: 'screen', file: 'src/screens/checkout.tsx', line: 6 },
};

const printAReceipt = {
  id: 'print-a-receipt',
  name: 'The app prints a receipt for a paid order',
  entryPoint: { kind: 'event-listener', file: 'src/api/receipt.ts', line: 4 },
};

const invented = {
  id: 'refund-an-order',
  name: 'An admin refunds an order',
  entryPoint: { kind: 'route', file: 'src/admin/refunds.ts', line: 3 },
};

const cannedAnswer = JSON.stringify({
  proposedEntryPoints: [placeAnOrder, printAReceipt, invented],
});

/** A copy of the fixture, so no test ever writes a map file into a committed fixture. */
const fixtureCopy = (): string => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-discovery-repo-'));
  cpSync(TYPESCRIPT_FIXTURE, repo, { recursive: true });
  return repo;
};

interface Harness {
  readonly sidecar: Sidecar;
  readonly provider: FakeProvider;
  readonly repo: string;
  readonly configDir: string;
  readonly keysAsked: string[];
  send<Result>(request: Record<string, unknown>): Promise<Result>;
  refusal(request: Record<string, unknown>): Promise<{ code: string; message: string }>;
}

const harness = (answers: readonly string[] = [cannedAnswer]): Harness => {
  const repo = fixtureCopy();
  const configDir = mkdtempSync(join(tmpdir(), 'archmap-discovery-config-'));
  const provider = createFakeProvider({ answers });
  const keysAsked: string[] = [];
  const sidecar = createSidecar({
    ai: {
      configDir,
      providerFor: (key) => {
        keysAsked.push(key);
        return provider;
      },
      now: () => new Date('2026-10-12T09:00:00Z'),
    },
  });
  return {
    sidecar,
    provider,
    repo,
    configDir,
    keysAsked,
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

/** Open and extract, as the app does, and hand back what every later command takes. */
const opened = async (
  h: Harness,
): Promise<{ repo: string; documents: ExtractResult['documents'] }> => {
  const open = await h.send<OpenResult>({ command: 'open', repo: h.repo, scope: ['src/**'] });
  const extracted = await h.send<ExtractResult>({
    command: 'extract',
    repo: open.repo,
    scope: open.scope,
    languages: open.languages,
  });
  return { repo: open.repo, documents: extracted.documents };
};

const filesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => statSync(join(directory, entry)).isFile())
    .sort();

describe('discovery, curation, and cost through the command surface', () => {
  it('discovers, curates, and lists candidates with the fake provider', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);

    const before = await h.send<MapResult>({ command: 'map', repo, documents });
    expect(before).toEqual({ flows: [], refused: [], curation: { rejected: [] } });

    await h.send<AccountResult>({ command: 'set-key', key: API_KEY });
    const estimate = await h.send<EstimateResult>({
      command: 'estimate-discovery',
      repo,
      documents,
    });
    expect(estimate.estimate.model).toBe(h.provider.model);
    expect(estimate.estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.estimate.usd).toBeGreaterThan(0);
    expect(estimate.month).toMatchObject({ month: '2026-10', passes: 0, usd: 0 });
    expect(h.provider.completed).toEqual([]);

    const discovered = await h.send<DiscoverResult>({ command: 'discover', repo, documents });
    expect(discovered.proposals).toEqual([placeAnOrder, printAReceipt]);
    expect(discovered.month).toMatchObject({ month: '2026-10', passes: 1 });
    expect(discovered.month.usd).toBeGreaterThan(0);
    expect(discovered.month.usd).toBe(discovered.spent.usd);
    expect(h.keysAsked).toContain(API_KEY);

    const curated = await h.send<CurateResult>({
      command: 'curate',
      repo,
      documents,
      accept: [placeAnOrder],
      reject: [printAReceipt],
    });
    const candidate = { ...placeAnOrder, lanes: [], nodes: [], edges: [] };
    expect(curated).toEqual({
      flows: [candidate],
      refused: [],
      curation: { rejected: [printAReceipt] },
    });

    const after = await h.send<MapResult>({ command: 'map', repo, documents });
    expect(after.flows).toEqual([candidate]);

    const again = await h.send<DiscoverResult>({ command: 'discover', repo, documents });
    expect(again.proposals).toEqual([]);
    expect(again.alreadyCurated).toEqual([
      { id: 'place-an-order', decision: 'accepted' },
      { id: 'print-a-receipt', decision: 'rejected' },
    ]);
    expect(again.month.passes).toBe(2);
  });

  it('never lets a proposal anchored to an unknown file reach curation', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    await h.send({ command: 'set-key', key: API_KEY });

    const discovered = await h.send<DiscoverResult>({ command: 'discover', repo, documents });
    expect(discovered.proposals.map((proposal) => proposal.id)).not.toContain('refund-an-order');
    expect(discovered.rejections).toEqual([
      expect.objectContaining({
        id: 'refund-an-order',
        code: 'unknown-file',
        at: 'proposedEntryPoints[2].entryPoint.file',
      }),
    ]);

    const refused = await h.refusal({
      command: 'curate',
      repo,
      documents,
      accept: [placeAnOrder, invented],
      reject: [],
    });
    expect(refused.code).toBe('proposal-refused');
    expect(existsSync(join(repo, '.archmap'))).toBe(false);
  });

  it('commits the curation results to the map file in the repo', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    await h.send({
      command: 'curate',
      repo,
      documents,
      accept: [placeAnOrder],
      reject: [printAReceipt],
    });

    expect(filesUnder(join(repo, '.archmap'))).toEqual([
      'curation.json',
      join('flows', 'place-an-order.json'),
    ]);
    expect(
      JSON.parse(readFileSync(join(repo, '.archmap/flows/place-an-order.json'), 'utf8')),
    ).toEqual({ ...placeAnOrder, lanes: [], nodes: [], edges: [] });
    expect(JSON.parse(readFileSync(join(repo, '.archmap/curation.json'), 'utf8'))).toEqual({
      rejected: [printAReceipt],
    });
  });

  it('refuses to decide again on a flow the map file already carries', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    const curate = { command: 'curate', repo, documents, accept: [placeAnOrder], reject: [] };
    await h.send(curate);
    expect((await h.refusal(curate)).code).toBe('already-curated');
  });

  it('lists a flow document the map file holds but the validator refuses', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    mkdirSync(join(repo, '.archmap/flows'), { recursive: true });
    writeFileSync(
      join(repo, '.archmap/flows/gone.json'),
      JSON.stringify({
        id: 'gone',
        name: 'A flow whose entry point file was deleted',
        entryPoint: { kind: 'screen', file: 'src/screens/deleted.tsx', line: 1 },
        lanes: [],
        nodes: [],
        edges: [],
      }),
    );
    writeFileSync(join(repo, '.archmap/flows/broken.json'), '{');

    const map = await h.send<MapResult>({ command: 'map', repo, documents });
    expect(map.flows).toEqual([]);
    expect(map.refused.map((refused) => [refused.file, refused.errors[0]?.code])).toEqual([
      ['.archmap/flows/broken.json', 'invalid-json'],
      ['.archmap/flows/gone.json', 'unknown-file'],
    ]);
  });
});

describe('the key and the monthly total', () => {
  it('refuses to estimate or discover before a key is stored, and calls no provider', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    expect((await h.refusal({ command: 'estimate-discovery', repo, documents })).code).toBe(
      'no-api-key',
    );
    expect((await h.refusal({ command: 'discover', repo, documents })).code).toBe('no-api-key');
    expect(h.keysAsked).toEqual([]);
  });

  it('stores the key outside the repo, readable by its owner alone', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    const account = await h.send<AccountResult>({ command: 'set-key', key: API_KEY });
    expect(account.keyStored).toBe(true);
    await h.send({ command: 'discover', repo, documents });

    const keyFile = join(h.configDir, 'credentials.json');
    expect(readFileSync(keyFile, 'utf8')).toContain(API_KEY);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    const inRepo = filesUnder(repo).filter((file) =>
      readFileSync(join(repo, file), 'utf8').includes(API_KEY),
    );
    expect(inRepo).toEqual([]);
  });

  it('keeps the monthly total outside the repo, and reports it on account', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    const fresh = await h.send<AccountResult>({ command: 'account' });
    expect(fresh).toEqual({
      keyStored: false,
      month: { month: '2026-10', passes: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
    });

    await h.send({ command: 'set-key', key: API_KEY });
    const discovered = await h.send<DiscoverResult>({ command: 'discover', repo, documents });
    const account = await h.send<AccountResult>({ command: 'account' });
    expect(account.month).toEqual(discovered.month);
    expect(existsSync(join(h.configDir, 'spend.json'))).toBe(true);
    expect(existsSync(join(repo, '.archmap'))).toBe(false);
  });

  it('counts a pass whose answer cannot be read, because its tokens were spent', async () => {
    const h = harness(['I found these flows: checkout and receipts.']);
    const { repo, documents } = await opened(h);
    await h.send({ command: 'set-key', key: API_KEY });
    expect((await h.refusal({ command: 'discover', repo, documents })).code).toBe(
      'provider-failed',
    );
    expect((await h.send<AccountResult>({ command: 'account' })).month.passes).toBe(1);
  });

  it('refuses an empty key', async () => {
    const h = harness();
    expect((await h.refusal({ command: 'set-key', key: '' })).code).toBe('malformed-request');
  });
});

describe('what the provider is asked', () => {
  it('sends the reference graph and the numbered source of every file in it', async () => {
    const h = harness();
    const { repo, documents } = await opened(h);
    await h.send({ command: 'set-key', key: API_KEY });
    await h.send({ command: 'discover', repo, documents });
    const [request] = h.provider.completed;
    expect(request?.prompt).toContain('src/screens/checkout.tsx (typescript)');
    expect(request?.prompt).toContain('6| export const Checkout');
    expect(request?.prompt).not.toContain('tools/build.ts');
  });
});
