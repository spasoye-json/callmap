import { formatMoney } from '../src/shared/money';

export const describeBuild = () => `built, and ${formatMoney({ cents: 0 })} spent`;
