import { confirm } from './mail';

interface Channel {
  deliver(text: string): string;
}

class Letter implements Channel {
  deliver(text: string): string {
    return `letter ${text}`;
  }
}

class Push implements Channel {
  deliver(text: string): string {
    return `push ${text}`;
  }
}

export const broadcast = (channel: Channel, text: string): string => channel.deliver(text);

export const announce = (total: number): string => broadcast(new Letter(), confirm(total));

export const urgent = (text: string): string => broadcast(new Push(), text);
