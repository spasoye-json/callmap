import { format } from '../../money/format';
import { book } from '../service/book';

export const placeOrder = (prices: readonly number[]): string => format(book(prices));
