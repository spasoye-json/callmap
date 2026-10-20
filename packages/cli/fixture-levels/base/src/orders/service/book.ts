import { round } from '../../money/round';
import { ship } from '../../shipping/carriers/post';

export const book = (prices: readonly number[]): number => {
  ship(prices.length);
  return round(prices.reduce((sum, price) => sum + price, 0));
};
