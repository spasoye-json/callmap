import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSidecar } from '@archmap/sidecar';
import { App } from '../src/App.tsx';
import type { SidecarClient } from '../src/sidecar-client.ts';

const TYPESCRIPT_FIXTURE = join(import.meta.dirname, '../../extractor-typescript/fixture');
const GO_FIXTURE = join(import.meta.dirname, '../../extractor-go/fixture');
const MIXED_FIXTURE = join(import.meta.dirname, '../../sidecar/fixture');

/** Each language row of the summary as the reader sees it: the tag, then its counts. */
const languageRows = (summary: HTMLElement): readonly (readonly string[])[] =>
  within(summary)
    .getAllByRole('listitem')
    .map((row) => [...row.children].map((cell) => cell.textContent));

/** A client that answers nothing, for a test that must not reach the sidecar at all. */
const silentClient: SidecarClient = {
  send: () => Promise.reject(new Error('the app sent a request before it was asked to open')),
};

/**
 * The sidecar in the same process: the whole command surface, with no shell and no window. Its
 * config directory is a temp one, so a test never reads the key or the spend of the person running it.
 */
const inProcessClient = (): SidecarClient => {
  const sidecar = createSidecar({
    ai: { configDir: mkdtempSync(join(tmpdir(), 'archmap-app-config-')) },
  });
  return { send: (request) => sidecar.handle(request) } as SidecarClient;
};

describe('the app', () => {
  it('boots and renders the flow picker', () => {
    render(<App client={silentClient} />);
    const picker = screen.getByRole('navigation', { name: 'Flow picker' });
    expect(within(picker).getByText('No flows yet')).toBeTruthy();
  });

  it('opens a repo under scope globs and shows the counts of its reference graph', async () => {
    render(<App client={inProcessClient()} />);
    fireEvent.change(screen.getByLabelText('Repo folder'), {
      target: { value: TYPESCRIPT_FIXTURE },
    });
    fireEvent.change(screen.getByLabelText('Scope globs'), { target: { value: 'src/**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const summary = await screen.findByRole('region', { name: 'Reference graph' });
    expect(within(summary).getByText('8 files')).toBeTruthy();
    expect(within(summary).getByText('9 reference edges')).toBeTruthy();
    expect(within(summary).getByText('typescript')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Flow picker' })).toBeTruthy();
  });

  it('opens the Go fixture and shows its summary under the go tag', async () => {
    render(<App client={inProcessClient()} />);
    fireEvent.change(screen.getByLabelText('Repo folder'), { target: { value: GO_FIXTURE } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const summary = await screen.findByRole('region', { name: 'Reference graph' });
    expect(languageRows(summary)).toEqual([['go', '8 files, 6 edges']]);
  });

  it('opens the mixed fixture and shows the merged summary per language', async () => {
    render(<App client={inProcessClient()} />);
    fireEvent.change(screen.getByLabelText('Repo folder'), { target: { value: MIXED_FIXTURE } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const summary = await screen.findByRole('region', { name: 'Reference graph' });
    expect(within(summary).getByText('10 files')).toBeTruthy();
    expect(within(summary).getByText('5 reference edges')).toBeTruthy();
    expect(languageRows(summary)).toEqual([
      ['go', '2 files, 1 edge'],
      ['ruby', '6 files, 3 edges'],
      ['typescript', '2 files, 1 edge'],
    ]);
  });
});
