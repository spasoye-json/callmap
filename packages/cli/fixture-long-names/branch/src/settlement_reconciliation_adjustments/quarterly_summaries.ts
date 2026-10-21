import { roundToCents } from '../statements/rounding';
import { reconcileOutstandingSettlementAdjustments } from './outstanding_balances';

export const summariseQuarterlyReconciliationAdjustments = (
  quarters: readonly number[][],
): number =>
  roundToCents(
    quarters
      .map(reconcileOutstandingSettlementAdjustments)
      .reduce((sum, amount) => sum + amount, 0),
  );
