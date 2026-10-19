import { vat } from './tax/vat';

export const invoice = (amount: number): number => amount + vat(amount);

export const bill = (amount: number): string => `total ${String(invoice(amount))}`;
