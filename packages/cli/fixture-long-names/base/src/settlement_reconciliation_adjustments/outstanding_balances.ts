import { roundToCents } from '../statements/rounding';

export const reconcileOutstandingSettlementAdjustments = (amounts: readonly number[]): number =>
  roundToCents(amounts.reduce((sum, amount) => sum + amount, 0));
