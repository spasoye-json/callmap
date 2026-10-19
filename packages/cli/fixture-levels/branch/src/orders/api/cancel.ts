import { refund } from '../service/refund';

export const cancelOrder = (paid: number): string => String(refund(paid));
