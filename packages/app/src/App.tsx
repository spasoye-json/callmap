/**
 * The app as a reader first meets it: point it at a repo under scope globs, watch it open, and see
 * the reference graph it found beside the flow picker. Every fact on screen comes back from the
 * sidecar command surface, so the UI holds no logic that reads a repo (ADR-0006).
 */

import { useState } from 'react';
import { buildFlowPicker, createFlowLibrary } from '@archmap/flow-library';
import type { FlowPickerRow } from '@archmap/flow-library';
import type {
  AccountResult,
  ExtractResult,
  MapResult,
  OpenResult,
  SidecarResponse,
} from '@archmap/sidecar';
import { Discovery, formatUsd } from './Discovery.tsx';
import type { SidecarClient } from './sidecar-client.ts';

type Session =
  | { readonly state: 'closed' }
  | { readonly state: 'opening' }
  | {
      readonly state: 'open';
      readonly opened: OpenResult;
      readonly extracted: ExtractResult;
      readonly map: MapResult;
      readonly account: AccountResult;
    }
  | { readonly state: 'refused'; readonly message: string };

/** One glob per line or per comma, so a pasted list reads the same as a typed one. */
const globsOf = (text: string): readonly string[] =>
  text
    .split(/[\n,]/)
    .map((glob) => glob.trim())
    .filter((glob) => glob !== '');

const resultOf = <Result,>(response: SidecarResponse<Result>): Result => {
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
};

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

const GraphSummary = ({ extracted }: { readonly extracted: ExtractResult }) => (
  <section aria-label="Reference graph" className="summary">
    <h2>Reference graph</h2>
    <p>
      <span>{plural(extracted.summary.files, 'file', 'files')}</span>
      <span>{plural(extracted.summary.edges, 'reference edge', 'reference edges')}</span>
    </p>
    <ul>
      {extracted.summary.languages.map((language) => (
        <li key={language.language}>
          <strong>{language.language}</strong>
          <span>
            {plural(language.files, 'file', 'files')}, {plural(language.edges, 'edge', 'edges')}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const FlowPicker = ({ rows }: { readonly rows: readonly FlowPickerRow[] }) => (
  <nav aria-label="Flow picker" className="picker">
    <h2>Flows</h2>
    {rows.length === 0 ? (
      <p className="empty">No flows yet</p>
    ) : (
      <ul>
        {rows.map((row) => (
          <li key={row.id} className={row.openable ? 'traced' : 'candidate'}>
            {row.name}
            {row.badge === null ? null : <span className="badge">{row.badge}</span>}
          </li>
        ))}
      </ul>
    )}
  </nav>
);

export const App = ({ client }: { readonly client: SidecarClient }) => {
  const [repo, setRepo] = useState('');
  const [scope, setScope] = useState('');
  const [session, setSession] = useState<Session>({ state: 'closed' });
  const pickerRows = buildFlowPicker(
    createFlowLibrary(session.state === 'open' ? session.map.flows : []),
  );

  const open = async (): Promise<void> => {
    setSession({ state: 'opening' });
    try {
      const opened = resultOf(await client.send({ command: 'open', repo, scope: globsOf(scope) }));
      const extracted = resultOf(
        await client.send({
          command: 'extract',
          repo: opened.repo,
          scope: opened.scope,
          languages: opened.languages,
        }),
      );
      const map = resultOf(
        await client.send({ command: 'map', repo: opened.repo, documents: extracted.documents }),
      );
      const account = resultOf(await client.send({ command: 'account' }));
      setSession({ state: 'open', opened, extracted, map, account });
    } catch (error) {
      setSession({
        state: 'refused',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <main className="app">
      <header>
        <h1>Archmap</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void open();
          }}
        >
          <label>
            Repo folder
            <input
              value={repo}
              onChange={(event) => {
                setRepo(event.target.value);
              }}
              required
            />
          </label>
          <label>
            Scope globs
            <textarea
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
              }}
              placeholder="src/**"
              rows={2}
            />
          </label>
          <button type="submit" disabled={session.state === 'opening'}>
            Open
          </button>
        </form>
      </header>
      {session.state === 'opening' ? <p role="status">Reading the repo</p> : null}
      {session.state === 'refused' ? <p role="alert">{session.message}</p> : null}
      {session.state === 'open' ? (
        <p className="spend">
          Spent this month: {formatUsd(session.account.month.usd)} over{' '}
          {plural(session.account.month.passes, 'pass', 'passes')}
        </p>
      ) : null}
      {session.state === 'open' ? (
        <p className="opened">
          {session.opened.repo}
          {session.opened.scope.length === 0
            ? ' (whole repo)'
            : ` (${session.opened.scope.join(', ')})`}
        </p>
      ) : null}
      <div className="workspace">
        <FlowPicker rows={pickerRows} />
        {session.state === 'open' ? (
          <div className="panels">
            <GraphSummary extracted={session.extracted} />
            <Discovery
              client={client}
              repo={session.opened.repo}
              documents={session.extracted.documents}
              account={session.account}
              onAccount={(account) => {
                setSession((before) => (before.state === 'open' ? { ...before, account } : before));
              }}
              onMap={(map) => {
                setSession((before) => (before.state === 'open' ? { ...before, map } : before));
              }}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
};
