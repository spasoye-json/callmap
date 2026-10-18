import { format, round } from './money';

export const subtotal = (prices: readonly number[]): number =>
  round(prices.reduce((sum, price) => sum + price, 0));

export const legacyTotal = (prices: readonly number[]): number => subtotal(prices) * 1.2;

export const label = (name: string): string => name.toUpperCase();

export const receipt = (prices: readonly number[]): string =>
  `${label('total')}: ${format(legacyTotal(prices))}`;
