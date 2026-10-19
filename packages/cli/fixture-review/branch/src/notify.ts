export interface Channel {
  send(text: string): string;
}

export class Mail implements Channel {
  send(text: string): string {
    return `mail: ${text}`;
  }
}

export class Sms implements Channel {
  send(text: string): string {
    return `sms: ${text}`;
  }
}
