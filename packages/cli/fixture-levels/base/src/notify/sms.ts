import { book } from '../orders/service/book';

export const retry = (prices: readonly number[]): number => book(prices);
