import { format } from './money';

export const alert = (amounts: readonly number[]): string[] => amounts.map(format);
