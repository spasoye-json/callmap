/**
 * What an AI pass costs, as data: the estimate a reader sees before any pass, discovery or trace,
 * and the monthly total every pass adds to (ADR-0010). Nothing here reads a file or calls a
 * provider.
 */

export {
  addSpend,
  costOf,
  estimateOf,
  monthOf,
  parseSpend,
  serialiseSpend,
  spendIn,
} from './cost.ts';
export type { CostEstimate, MonthlySpend, SpendRecord, TokenPrice, TokenUsage } from './cost.ts';
