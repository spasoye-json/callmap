import { format } from './money';
import type { Channel } from './notify';

export const alert = (channel: Channel, amounts: readonly number[]): string[] =>
  amounts.map((amount) => channel.send(format(amount)));

export const relay = (raw: string): void => {
  JSON.parse(raw).notify();
};
