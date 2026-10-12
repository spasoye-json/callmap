/**
 * What every AI pass answers about its cost, discovery and trace alike (ADR-0010). Types only, so
 * the UI imports them by type.
 */

import type { CostEstimate, MonthlySpend } from '@archmap/cost';

export type { CostEstimate, MonthlySpend } from '@archmap/cost';

export interface EstimateResult {
  readonly estimate: CostEstimate;
  /** The month so far, before this pass. */
  readonly month: MonthlySpend;
}
