import { receipt } from './cart';

export const checkout = (prices: readonly number[]): string => receipt(prices);
