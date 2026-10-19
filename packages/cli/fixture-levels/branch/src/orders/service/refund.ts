import { round } from '../../money/round';

export const refund = (paid: number): number => round(paid * 0.9);
