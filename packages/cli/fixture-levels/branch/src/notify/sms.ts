import { book } from '../orders/service/book';

export const retry = (prices: readonly number[]): number => book(prices);

export const relay = (raw: string): void => {
  JSON.parse(raw).notify();
};
