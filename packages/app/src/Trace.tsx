/**
 * Opening a candidate (ADR-0005): it names its flow and its entry point for free, shows what the
 * trace will cost, and runs the trace only when the reader says so. The traced flow is saved by
 * the sidecar, so this panel is never shown for that flow again.
 */

import { useState } from 'react';
import type { FlowDocument } from '@archmap/flow-document';
import type { EstimateResult, ExtractResult, TraceResult } from '@archmap/sidecar';
import { EstimatedCost, resultOf, useStepRunner } from './shared.tsx';
import type { SidecarClient } from './sidecar-client.ts';

export interface TraceProps {
  readonly client: SidecarClient;
  readonly repo: string;
  readonly documents: ExtractResult['documents'];
  readonly flow: FlowDocument;
  readonly onTraced: (result: TraceResult) => void;
}

export const Trace = ({ client, repo, documents, flow, onTraced }: TraceProps) => {
  const { busy, problem, run } = useStepRunner();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  const estimateCost = () =>
    run(async () => {
      setEstimate(
        resultOf(
          await client.send({ command: 'estimate-trace', repo, documents, flowId: flow.id }),
        ),
      );
    });

  const trace = () =>
    run(async () => {
      onTraced(resultOf(await client.send({ command: 'trace', repo, documents, flowId: flow.id })));
    });

  return (
    <section aria-label="Trace" className="trace">
      <h2>{flow.name}</h2>
      <p>
        Candidate, not traced yet. Starts at the {flow.entryPoint.kind}{' '}
        <code>
          {flow.entryPoint.file}:{flow.entryPoint.line}
        </code>
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void estimateCost();
          }}
        >
          Estimate trace cost
        </button>
        {estimate === null ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void trace();
            }}
          >
            Run trace
          </button>
        )}
      </div>
      {estimate === null ? null : <EstimatedCost estimate={estimate} />}
      {problem === null ? null : <p role="alert">{problem}</p>}
    </section>
  );
};
