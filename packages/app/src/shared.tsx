/**
 * What every panel that talks to the sidecar shares: reading an answer, counting in words,
 * showing dollars, running one step at a time, and the estimate a pass shows before it runs
 * (ADR-0010).
 */

import { useState } from 'react';
import type { EstimateResult, SidecarResponse } from '@archmap/sidecar';

export const resultOf = <Result,>(response: SidecarResponse<Result>): Result => {
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
};

export const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

export const formatUsd = (usd: number): string =>
  usd > 0 && usd < 0.01 ? 'under $0.01' : `$${usd.toFixed(2)}`;

export interface StepRunner {
  /** True while a step runs, so a panel can keep a second one from starting. */
  readonly busy: boolean;
  /** Why the last step failed, or null when it did not. */
  readonly problem: string | null;
  readonly run: (step: () => Promise<void>) => Promise<void>;
}

export const useStepRunner = (): StepRunner => {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
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
  return { busy, problem, run };
};

export const EstimatedCost = ({ estimate }: { readonly estimate: EstimateResult }) => (
  <p role="status" aria-label="Estimated cost">
    About {formatUsd(estimate.estimate.usd)} on {estimate.estimate.model}:{' '}
    {plural(estimate.estimate.inputTokens, 'input token', 'input tokens')} and up to{' '}
    {plural(estimate.estimate.outputTokens, 'output token', 'output tokens')}
  </p>
);
