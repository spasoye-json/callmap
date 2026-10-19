import { percent } from '../percent';
import { vatRate } from './rate';

export const vat = (amount: number): number => percent(amount, vatRate());
