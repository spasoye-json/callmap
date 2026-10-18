export interface Channel {
  send(text: string): string;
}

export interface Archive {
  store(text: string): void;
}

export class Mail implements Channel {
  send(text: string): string {
    return `mail ${text}`;
  }
}

export class Sms implements Channel {
  send(text: string): string {
    return `sms ${text}`;
  }
}

export const broadcast = (channel: Channel, text: string): string => channel.send(text);

export const archive = (target: Archive, text: string): void => {
  target.store(text);
};
