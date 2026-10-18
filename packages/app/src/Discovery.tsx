/**
 * Discovery as a reader drives it (ADR-0010): store a key, see what the pass will cost, run it,
 * then accept or reject each proposed entry point. The cost shows before the pass can run, and the
 * proposals the validator refused never reach the list a reader decides on.
 */

import { useState } from 'react';
import type {
  AccountResult,
  DiscoverResult,
  EstimateResult,
  ExtractResult,
  MapResult,
} from '@archmap/sidecar';
import { EstimatedCost, plural, resultOf, useStepRunner } from './shared.tsx';
import type { SidecarClient } from './sidecar-client.ts';

type Decision = 'accept' | 'reject';

type ProposedEntryPoint = DiscoverResult['proposals'][number];

export interface DiscoveryProps {
  readonly client: SidecarClient;
  readonly repo: string;
  readonly documents: ExtractResult['documents'];
  readonly account: AccountResult;
  readonly onAccount: (account: AccountResult) => void;
  readonly onMap: (map: MapResult) => void;
}

const ProposalItem = ({
  proposal,
  decision,
  onDecide,
}: {
  readonly proposal: ProposedEntryPoint;
  readonly decision: Decision | undefined;
  readonly onDecide: (decision: Decision) => void;
}) => (
  <li>
    <h3>{proposal.name}</h3>
    <p>
      <code>
        {proposal.entryPoint.file}:{proposal.entryPoint.line}
      </code>{' '}
      {proposal.entryPoint.kind}
    </p>
    <fieldset>
      <legend>Decision for {proposal.id}</legend>
      {(['accept', 'reject'] as const).map((choice) => (
        <label key={choice}>
          <input
            type="radio"
            name={`decision-${proposal.id}`}
            checked={decision === choice}
            onChange={() => {
              onDecide(choice);
            }}
          />
          {choice === 'accept' ? 'Accept' : 'Reject'}
        </label>
      ))}
    </fieldset>
  </li>
);

export const Discovery = ({
  client,
  repo,
  documents,
  account,
  onAccount,
  onMap,
}: DiscoveryProps) => {
  const [key, setKey] = useState('');
  const { busy, problem, run } = useStepRunner();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [discovered, setDiscovered] = useState<DiscoverResult | null>(null);
  const [decisions, setDecisions] = useState<Readonly<Record<string, Decision>>>({});

  const storeKey = () =>
    run(async () => {
      onAccount(resultOf(await client.send({ command: 'set-key', key })));
      setKey('');
    });

  const estimateCost = () =>
    run(async () => {
      setEstimate(resultOf(await client.send({ command: 'estimate-discovery', repo, documents })));
    });

  const discover = () =>
    run(async () => {
      const result = resultOf(await client.send({ command: 'discover', repo, documents }));
      setDiscovered(result);
      setDecisions({});
      onAccount({ keyStored: true, month: result.month });
    });

  const pending = discovered?.proposals ?? [];
  const decided = (decision: Decision) =>
    pending.filter((proposal) => decisions[proposal.id] === decision);

  const saveCuration = () =>
    run(async () => {
      const accept = decided('accept');
      const reject = decided('reject');
      onMap(resultOf(await client.send({ command: 'curate', repo, documents, accept, reject })));
      const done = new Set([...accept, ...reject].map((proposal) => proposal.id));
      setDiscovered((before) =>
        before === null
          ? null
          : { ...before, proposals: before.proposals.filter((proposal) => !done.has(proposal.id)) },
      );
    });

  return (
    <section aria-label="Discovery" className="discovery">
      <h2>Discovery</h2>
      {account.keyStored ? null : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void storeKey();
          }}
        >
          <label>
            Anthropic API key
            <input
              type="password"
              value={key}
              autoComplete="off"
              onChange={(event) => {
                setKey(event.target.value);
              }}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Store key
          </button>
        </form>
      )}
      {account.keyStored ? (
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void estimateCost();
            }}
          >
            Estimate cost
          </button>
          {estimate === null ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void discover();
              }}
            >
              Run discovery
            </button>
          )}
        </div>
      ) : null}
      {estimate === null ? null : <EstimatedCost estimate={estimate} />}
      {problem === null ? null : <p role="alert">{problem}</p>}
      {discovered === null ? null : (
        <>
          {discovered.rejections.length === 0 ? null : (
            <p className="refused">
              {plural(
                new Set(discovered.rejections.map((rejection) => rejection.at.split('.')[0])).size,
                'proposal',
                'proposals',
              )}{' '}
              refused by the validator
            </p>
          )}
          {pending.length === 0 ? (
            <p className="empty">No proposals left to decide</p>
          ) : (
            <>
              <ul aria-label="Proposed entry points" className="proposals">
                {pending.map((proposal) => (
                  <ProposalItem
                    key={proposal.id}
                    proposal={proposal}
                    decision={decisions[proposal.id]}
                    onDecide={(decision) => {
                      setDecisions((before) => ({ ...before, [proposal.id]: decision }));
                    }}
                  />
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || decided('accept').length + decided('reject').length === 0}
                onClick={() => {
                  void saveCuration();
                }}
              >
                Save curation
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
};
