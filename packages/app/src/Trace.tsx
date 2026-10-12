/**
 * Opening a candidate (ADR-0005): it names its flow and its entry point for free, shows what the
 * trace will cost, and runs the trace only when the reader says so. The traced flow is saved by
 * the sidecar, so this panel is never shown for that flow again.
 */

import { useState } from 'react';
import type { FlowDocument } from '@archmap/flow-document';
import type { EstimateResult, ExtractResult, SidecarResponse, TraceResult } from '@archmap/sidecar';
import { formatUsd } from './Discovery.tsx';
import type { SidecarClient } from './sidecar-client.ts';

export interface TraceProps {
  readonly client: SidecarClient;
  readonly repo: string;
  readonly documents: ExtractResult['documents'];
  readonly flow: FlowDocument;
  readonly onTraced: (result: TraceResult) => void;
}

const resultOf = <Result,>(response: SidecarResponse<Result>): Result => {
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
};

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

export const Trace = ({ client, repo, documents, flow, onTraced }: TraceProps) => {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  const run = async (step: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      await step();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

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
      {estimate === null ? null : (
        <p role="status" aria-label="Estimated cost">
          About {formatUsd(estimate.estimate.usd)} on {estimate.estimate.model}:{' '}
          {plural(estimate.estimate.inputTokens, 'input token', 'input tokens')} and up to{' '}
          {plural(estimate.estimate.outputTokens, 'output token', 'output tokens')}
        </p>
      )}
      {problem === null ? null : <p role="alert">{problem}</p>}
    </section>
  );
};
