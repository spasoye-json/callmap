import { format } from '../../money/format';
import { refund } from '../service/refund';

export const cancelOrder = (paid: number): string => format(refund(paid));
