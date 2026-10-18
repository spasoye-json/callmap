import { format, round } from './money';

export const subtotal = (prices: readonly number[]): number =>
  round(prices.reduce((sum, price) => sum + price, 0));

export const taxed = (prices: readonly number[]): number => subtotal(prices) * 1.25;

export const receipt = (prices: readonly number[]): string => format(taxed(prices));

export const label = (name: string): string => name.toUpperCase();
