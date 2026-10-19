import { round } from '../../money/round';
import { confirm } from '../../notify/mail';
import { ship } from '../../shipping/carriers/post';

export const book = (prices: readonly number[]): number => {
  ship(prices.length);
  const total = round(prices.reduce((sum, price) => sum + price, 0));
  confirm(total);
  return total;
};
