import { roundToCents } from '../statements/rounding';

export const reconcileOutstandingSettlementAdjustments = (amounts: readonly number[]): number =>
  roundToCents(amounts.filter((amount) => amount !== 0).reduce((sum, amount) => sum + amount, 0));
