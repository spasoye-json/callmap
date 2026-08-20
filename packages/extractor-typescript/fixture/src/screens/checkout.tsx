import { placeOrder } from '@app/api/orders-client';
import { formatMoney } from '@shared';
import type { Money } from '../shared/money';
import { useState } from 'react';

export const Checkout = (total: Money) => {
  const [pending, setPending] = useState(false);
  return { label: formatMoney(total), pending, place: () => placeOrder(total, setPending) };
};
