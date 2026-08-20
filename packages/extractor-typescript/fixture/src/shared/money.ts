import { addCents } from '../legacy/totals.js';

export interface Money {
  readonly cents: number;
}

export const formatMoney = (money: Money) => `$${(money.cents / 100).toFixed(2)}`;

export const plus = (left: Money, right: Money): Money => ({
  cents: addCents(left.cents, right.cents),
});
