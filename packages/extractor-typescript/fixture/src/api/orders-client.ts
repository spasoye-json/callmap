import type { Money } from '@app/shared/money';

export const placeOrder = async (total: Money, pending: (value: boolean) => void) => {
  pending(true);
  const { printReceipt } = await import('./receipt');
  return printReceipt(total);
};
