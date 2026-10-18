import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MIXED_ORDER,
  MIXED_ORDERS_CONTROLLER,
  placeAnOrderTraceAnswer,
  tracePlaceAnOrder,
} from '@archmap/testing';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import type { Sidecar } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
import type { SidecarClient } from '../src/sidecar-client.ts';

const MIXED_FIXTURE = join(import.meta.dirname, '../../sidecar/fixture');

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
  await tracePlaceAnOrder(sidecar, repo);
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

  it('marks the flow stale once an anchored file is gone, and keeps it in the picker', async () => {
    const { repo, sidecar } = await tracedRepo();
    rmSync(join(repo, MIXED_ORDER));
    render(<App client={{ send: (request) => sidecar.handle(request) } as SidecarClient} />);

    const picker = await openRepo(repo);
    expect(within(rowOf(picker, /Place an order/)).getByText('stale')).toBeTruthy();
  });
});

describe('a flow file the map cannot read', () => {
  it('is listed in the picker with the reason it was refused', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'archmap-refused-repo-'));
    cpSync(MIXED_FIXTURE, repo, { recursive: true });
    mkdirSync(join(repo, '.archmap/flows'), { recursive: true });
    writeFileSync(join(repo, '.archmap/flows/broken.json'), 'not json\n');
    const sidecar = createSidecar({
      ai: { configDir: mkdtempSync(join(tmpdir(), 'archmap-refused-config-')) },
    });
    render(<App client={{ send: (request) => sidecar.handle(request) } as SidecarClient} />);

    const refused = within(await openRepo(repo)).getByRole('region', {
      name: 'Refused flow files',
    });
    expect(within(refused).getByText('.archmap/flows/broken.json')).toBeTruthy();
    expect(within(refused).getByText(/not valid JSON/)).toBeTruthy();
  });
});
