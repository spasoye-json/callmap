import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeProvider, createSidecar } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
import type { SidecarClient } from '../src/sidecar-client.ts';

const TYPESCRIPT_FIXTURE = join(import.meta.dirname, '../../extractor-typescript/fixture');

const answer = JSON.stringify({
  proposedEntryPoints: [
    {
      id: 'place-an-order',
      name: 'A shopper places an order from the checkout screen',
      entryPoint: { kind: 'screen', file: 'src/screens/checkout.tsx', line: 6 },
    },
    {
      id: 'print-a-receipt',
      name: 'The app prints a receipt for a paid order',
      entryPoint: { kind: 'event-listener', file: 'src/api/receipt.ts', line: 4 },
    },
    {
      id: 'refund-an-order',
      name: 'An admin refunds an order',
      entryPoint: { kind: 'route', file: 'src/admin/refunds.ts', line: 3 },
    },
  ],
});

/** The sidecar in this process, on a copy of the fixture, with a fake provider and a temp config. */
const discoveryClient = (): { client: SidecarClient; repo: string } => {
  const repo = mkdtempSync(join(tmpdir(), 'archmap-app-repo-'));
  cpSync(TYPESCRIPT_FIXTURE, repo, { recursive: true });
  const provider = createFakeProvider({ answers: [answer] });
  const sidecar = createSidecar({
    ai: {
      configDir: mkdtempSync(join(tmpdir(), 'archmap-app-config-')),
      providerFor: () => provider,
      now: () => new Date('2026-10-12T09:00:00Z'),
    },
  });
  return { client: { send: (request) => sidecar.handle(request) } as SidecarClient, repo };
};

const openRepo = async (repo: string): Promise<HTMLElement> => {
  fireEvent.change(screen.getByLabelText('Repo folder'), { target: { value: repo } });
  fireEvent.change(screen.getByLabelText('Scope globs'), { target: { value: 'src/**' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  return screen.findByRole('region', { name: 'Discovery' });
};

describe('discovery in the app', () => {
  it('shows the cost before the pass, curates, and lists candidates in the picker', async () => {
    const { client, repo } = discoveryClient();
    render(<App client={client} />);
    const discovery = await openRepo(repo);
    expect(within(discovery).queryByRole('button', { name: 'Run discovery' })).toBeNull();
    expect(screen.getByText('Spent this month: $0.00 over 0 passes')).toBeTruthy();

    fireEvent.change(within(discovery).getByLabelText('Anthropic API key'), {
      target: { value: 'sk-ant-test' },
    });
    fireEvent.click(within(discovery).getByRole('button', { name: 'Store key' }));
    fireEvent.click(await within(discovery).findByRole('button', { name: 'Estimate cost' }));

    const estimate = await within(discovery).findByRole('status', { name: 'Estimated cost' });
    expect(estimate.textContent).toMatch(/fake-model/);
    expect(estimate.textContent).toMatch(/input tokens/);

    fireEvent.click(within(discovery).getByRole('button', { name: 'Run discovery' }));
    const proposals = await within(discovery).findByRole('list', { name: 'Proposed entry points' });
    const items = within(proposals).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'A shopper places an order from the checkout screen',
      'The app prints a receipt for a paid order',
    ]);
    expect(within(discovery).getByText(/1 proposal refused by the validator/)).toBeTruthy();
    expect(screen.getByText(/^Spent this month: .+ over 1 pass$/)).toBeTruthy();

    const [placeAnOrder, printAReceipt] = items;
    if (placeAnOrder === undefined || printAReceipt === undefined) throw new Error('no proposals');
    fireEvent.click(within(placeAnOrder).getByRole('radio', { name: 'Accept' }));
    fireEvent.click(within(printAReceipt).getByRole('radio', { name: 'Reject' }));
    fireEvent.click(within(discovery).getByRole('button', { name: 'Save curation' }));

    const picker = screen.getByRole('navigation', { name: 'Flow picker' });
    const candidate = await within(picker).findByText(
      'A shopper places an order from the checkout screen',
    );
    expect(candidate.closest('li')?.className).toBe('candidate');
    expect(within(picker).queryByText('The app prints a receipt for a paid order')).toBeNull();
  });
});
