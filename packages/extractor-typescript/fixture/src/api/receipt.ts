import { formatMoney } from '../shared/money';
import type { Money } from '../shared/money';

export const printReceipt = (total: Money) => `Paid ${formatMoney(total)}`;
