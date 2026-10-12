/**
 * The app as a reader first meets it: point it at a repo under scope globs, watch it open, and see
 * the reference graph it found beside the flow picker. Every fact on screen comes back from the
 * sidecar command surface, so the UI holds no logic that reads a repo (ADR-0006).
 */

import { useState } from 'react';
import { editorUrl } from '@archmap/canvas-model';
import type { Anchor } from '@archmap/canvas-model';
import { isTracedFlow } from '@archmap/flow-document';
import { buildFlowPicker, createFlowLibrary } from '@archmap/flow-library';
import type { FlowPickerRow } from '@archmap/flow-library';
import type {
  AccountResult,
  ExtractResult,
  MapResult,
  OpenResult,
  RefusedFlowFile,
  SidecarResponse,
} from '@archmap/sidecar';
import { Discovery, formatUsd } from './Discovery.tsx';
import { FlowCanvas } from './FlowCanvas.tsx';
import { Trace } from './Trace.tsx';
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

/** A flow file the map could not read stays in view, so a broken file is never lost silently. */
const RefusedFlows = ({ refused }: { readonly refused: readonly RefusedFlowFile[] }) =>
  refused.length === 0 ? null : (
    <section aria-label="Refused flow files" className="refused">
      <h3>Refused flow files</h3>
      <ul>
        {refused.map((flowFile) => (
          <li key={flowFile.file}>
            <code>{flowFile.file}</code>
            <span>{flowFile.errors.map((error) => error.message).join('; ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );

const FlowPicker = ({
  rows,
  refused,
  openId,
  onOpen,
}: {
  readonly rows: readonly FlowPickerRow[];
  readonly refused: readonly RefusedFlowFile[];
  readonly openId: string | null;
  readonly onOpen: (flowId: string) => void;
}) => (
  <nav aria-label="Flow picker" className="picker">
    <h2>Flows</h2>
    {rows.length === 0 ? (
      <p className="empty">No flows yet</p>
    ) : (
      <ul>
        {rows.map((row) => (
          <li key={row.id} className={row.openable ? 'traced' : 'candidate'}>
            <button
              type="button"
              aria-current={row.id === openId ? 'true' : undefined}
              onClick={() => {
                onOpen(row.id);
              }}
            >
              {row.name}
            </button>
            {row.badge === null ? null : <span className="badge">{row.badge}</span>}
          </li>
        ))}
      </ul>
    )}
    <RefusedFlows refused={refused} />
  </nav>
);

export const App = ({ client }: { readonly client: SidecarClient }) => {
  const [repo, setRepo] = useState('');
  const [scope, setScope] = useState('');
  const [session, setSession] = useState<Session>({ state: 'closed' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editorProblem, setEditorProblem] = useState<string | null>(null);
  const pickerRows =
    session.state === 'open'
      ? buildFlowPicker(createFlowLibrary(session.map.flows), session.map.marks)
      : [];
  const openFlow =
    session.state === 'open' ? session.map.flows.find((flow) => flow.id === openId) : undefined;

  const openInEditor = async (repoRoot: string, anchor: Anchor): Promise<void> => {
    setEditorProblem(null);
    const response = await client.send({
      command: 'open-in-editor',
      repo: repoRoot,
      url: editorUrl(repoRoot, anchor),
    });
    if (!response.ok) setEditorProblem(response.error.message);
  };

  /** The traced flow is read back from the map file, so the canvas draws what was saved. */
  const traced = async (repoRoot: string, documents: ExtractResult['documents']) => {
    const map = resultOf(await client.send({ command: 'map', repo: repoRoot, documents }));
    const account = resultOf(await client.send({ command: 'account' }));
    setSession((before) => (before.state === 'open' ? { ...before, map, account } : before));
  };

  const open = async (): Promise<void> => {
    setSession({ state: 'opening' });
    setOpenId(null);
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
        <FlowPicker
          rows={pickerRows}
          refused={session.state === 'open' ? session.map.refused : []}
          openId={openId}
          onOpen={setOpenId}
        />
        {session.state === 'open' ? (
          <div className="panels">
            {editorProblem === null ? null : <p role="alert">{editorProblem}</p>}
            {openFlow === undefined ? null : isTracedFlow(openFlow) ? (
              <FlowCanvas
                key={openFlow.id}
                flow={openFlow}
                onOpenAnchor={(anchor) => {
                  void openInEditor(session.opened.repo, anchor);
                }}
              />
            ) : (
              <Trace
                key={openFlow.id}
                client={client}
                repo={session.opened.repo}
                documents={session.extracted.documents}
                flow={openFlow}
                onTraced={() => {
                  void traced(session.opened.repo, session.extracted.documents);
                }}
              />
            )}
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
