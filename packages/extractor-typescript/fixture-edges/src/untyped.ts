import mailer from 'legacy-mailer';

export const relay = (raw: string): void => {
  JSON.parse(raw).notify(raw);
};

export const mail = (text: string): void => {
  mailer.send(text);
};

export const notifyEach = (hooks: readonly ((text: string) => void)[], text: string): void => {
  for (const hook of hooks) hook(text);
};
