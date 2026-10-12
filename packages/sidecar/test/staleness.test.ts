import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MIXED_CHECKOUT_SCREEN,
  MIXED_ORDER,
  MIXED_ORDERS_CLIENT,
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type { ExtractResult, MapResult, OpenResult } from '@archmap/sidecar';

const MIXED_FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
const NOW = () => new Date('2026-10-12T09:00:00Z');

let documents: ExtractResult['documents'];

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

const sha256Of = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

const send = async <Result>(
  sidecar: ReturnType<typeof createSidecar>,
  request: Record<string, unknown>,
): Promise<Result> => {
  const response = await sidecar.handle(request);
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.result as Result;
};

/** A copy of the mixed repo with the checkout traced through a fake provider. */
const tracedRepo = async () => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-stale-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const configDir = mkdtempSync(join(tmpdir(), 'archmap-stale-config-'));
  const provider = createFakeProvider({ answers: [placeAnOrderTraceAnswer()] });
  const sidecar = createSidecar({ ai: { configDir, providerFor: () => provider, now: NOW } });
  await send(sidecar, {
    command: 'curate',
    repo,
    documents,
    accept: [placeAnOrderProposal()],
    reject: [],
  });
  await send(sidecar, { command: 'set-key', key: 'sk-ant-test' });
  await send(sidecar, { command: 'trace', repo, documents, flowId: 'place-an-order' });
  return { repo, configDir, provider, sidecar };
};

describe('the anchor stamp a trace leaves', () => {
  it('stamps the content hash of every anchored file into the map file', async () => {
    const { repo } = await tracedRepo();
    const stamps: unknown = JSON.parse(
      readFileSync(join(repo, '.archmap/flow-anchors.json'), 'utf8'),
    );
    expect(stamps).toEqual({
      'place-an-order': {
        [MIXED_CHECKOUT_SCREEN]: sha256Of(join(repo, MIXED_CHECKOUT_SCREEN)),
        [MIXED_ORDERS_CLIENT]: sha256Of(join(repo, MIXED_ORDERS_CLIENT)),
        [MIXED_ORDERS_CONTROLLER]: sha256Of(join(repo, MIXED_ORDERS_CONTROLLER)),
        [MIXED_ORDER]: sha256Of(join(repo, MIXED_ORDER)),
      },
    });
  });
});

describe('the stale mark the map answers with', () => {
  it('marks an unchanged traced flow fresh', async () => {
    const { repo, sidecar } = await tracedRepo();
    const map = await send<MapResult>(sidecar, { command: 'map', repo, documents });
    expect(map.marks).toEqual([{ flowId: 'place-an-order', state: 'fresh', reasons: [] }]);
  });

  it('marks the flow stale when an anchored file changes, and does not trace it again', async () => {
    const { repo, sidecar, provider } = await tracedRepo();
    const before = readFileSync(join(repo, '.archmap/flows/place-an-order.json'), 'utf8');
    appendFileSync(join(repo, MIXED_ORDERS_CONTROLLER), '# touched\n');

    const map = await send<MapResult>(sidecar, { command: 'map', repo, documents });
    expect(map.marks).toEqual([
      {
        flowId: 'place-an-order',
        state: 'stale',
        reasons: [{ code: 'changed', file: MIXED_ORDERS_CONTROLLER }],
      },
    ]);
    expect(provider.completed).toHaveLength(1);
    expect(readFileSync(join(repo, '.archmap/flows/place-an-order.json'), 'utf8')).toBe(before);
  });
});

describe('a teammate who clones the repo', () => {
  it('reads the same map with the same marks, and calls no provider', async () => {
    const { repo, sidecar } = await tracedRepo();
    const mine = await send<MapResult>(sidecar, { command: 'map', repo, documents });

    const clone = mkdtempSync(join(tmpdir(), 'archmap-stale-clone-'));
    cpSync(repo, clone, { recursive: true });
    const keysAsked: string[] = [];
    const teammate = createSidecar({
      ai: {
        configDir: mkdtempSync(join(tmpdir(), 'archmap-stale-teammate-')),
        providerFor: (key) => {
          keysAsked.push(key);
          return createFakeProvider({ answers: [] });
        },
        now: NOW,
      },
    });
    const opened = await send<OpenResult>(teammate, { command: 'open', repo: clone, scope: [] });
    const extracted = await send<ExtractResult>(teammate, {
      command: 'extract',
      repo: clone,
      scope: [],
      languages: opened.languages,
    });
    const theirs = await send<MapResult>(teammate, {
      command: 'map',
      repo: clone,
      documents: extracted.documents,
    });

    expect(theirs).toEqual(mine);
    expect(theirs.marks.map((mark) => mark.state)).toEqual(['fresh']);
    expect(keysAsked).toEqual([]);
  });
});

describe('anchor stamps the map cannot read', () => {
  it('refuses the map rather than read a flow as fresh', async () => {
    const { repo, sidecar } = await tracedRepo();
    writeFileSync(join(repo, '.archmap/flow-anchors.json'), '{"place-an-order": "abc"}\n');
    const response = await sidecar.handle({ command: 'map', repo, documents });
    expect(response.ok ? null : response.error.code).toBe('map-file-refused');
  });
});
