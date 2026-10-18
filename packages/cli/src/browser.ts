import { spawn } from 'node:child_process';

const openerOf = (platform: NodeJS.Platform, target: string): readonly [string, string[]] => {
  if (platform === 'darwin') return ['open', [target]];
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', target]];
  return ['xdg-open', [target]];
};

export const openInBrowser = (target: string): void => {
  const [command, args] = openerOf(process.platform, target);
  const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
  child.on('error', () => undefined);
  child.unref();
};
