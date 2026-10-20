import { round } from './round';

export const format = (amount: number): string => `${round(amount).toFixed(2)} EUR`;
