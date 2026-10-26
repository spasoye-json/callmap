import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const callmapCacheFolder = (): string => {
  const home = process.env['XDG_CACHE_HOME'];
  return join(home !== undefined && isAbsolute(home) ? home : join(homedir(), '.cache'), 'callmap');
};
