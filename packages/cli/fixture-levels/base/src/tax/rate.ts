import { round } from '../money/round';

export const taxOf = (amount: number): number => round(amount * 0.2);
