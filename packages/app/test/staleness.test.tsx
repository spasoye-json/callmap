// @vitest-environment jsdom
import { appendFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type { ExtractResult, OpenResult, Sidecar } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
import type { SidecarClient } from '../src/sidecar-client.ts';

const MIXED_FIXTURE = join(import.meta.dirname, '../../sidecar/fixture');

afterEach(cleanup);

const send = async (sidecar: Sidecar, request: Record<string, unknown>): Promise<unknown> => {
  const response = await sidecar.handle(request);
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
};

/** A copy of the mixed repo with the checkout traced and stamped through a fake provider. */
const tracedRepo = async (): Promise<{ repo: string; sidecar: Sidecar }> => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-picker-repo-'));
  cpSync(MIXED_FIXTURE, repo, { recursive: true });
  const provider = createFakeProvider({ answers: [placeAnOrderTraceAnswer()] });
  const sidecar = createSidecar({
    ai: {
      configDir: mkdtempSync(join(tmpdir(), 'archmap-picker-config-')),
      providerFor: () => provider,
    },
  });
  const opened = (await send(sidecar, { command: 'open', repo, scope: [] })) as OpenResult;
  const { documents } = (await send(sidecar, {
    command: 'extract',
    repo,
    scope: [],
    languages: opened.languages,
  })) as ExtractResult;
  await send(sidecar, { command: 'set-key', key: 'sk-ant-test' });
  await send(sidecar, {
    command: 'curate',
    repo,
    documents,
    accept: [placeAnOrderProposal()],
    reject: [],
  });
  await send(sidecar, { command: 'trace', repo, documents, flowId: 'place-an-order' });
  return { repo, sidecar };
};

const openRepo = async (repo: string): Promise<HTMLElement> => {
  fireEvent.change(screen.getByLabelText('Repo folder'), { target: { value: repo } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByRole('region', { name: 'Reference graph' });
  return screen.getByRole('navigation', { name: 'Flow picker' });
};

const rowOf = (picker: HTMLElement, name: RegExp): HTMLElement => {
  const row = within(picker).getByRole('button', { name }).closest('li');
  if (row === null) throw new Error('the flow has no row in the picker');
  return row;
};

describe('the stale mark in the flow picker', () => {
  it('shows no mark on a flow whose anchored files are unchanged', async () => {
    const { repo, sidecar } = await tracedRepo();
    render(<App client={{ send: (request) => sidecar.handle(request) } as SidecarClient} />);
    const picker = await openRepo(repo);
    expect(within(rowOf(picker, /Place an order/)).queryByText('stale')).toBeNull();
  });

  it('marks the flow stale once an anchored file changes and the repo is read again', async () => {
    const { repo, sidecar } = await tracedRepo();
    render(<App client={{ send: (request) => sidecar.handle(request) } as SidecarClient} />);
    await openRepo(repo);
    appendFileSync(join(repo, MIXED_ORDERS_CONTROLLER), '# touched\n');

    const picker = await openRepo(repo);
    expect(within(rowOf(picker, /Place an order/)).getByText('stale')).toBeTruthy();
  });
});
