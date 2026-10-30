import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tempDir } from '../../../test/temp-dir.ts';

// A CI runner can hold the command in /usr/bin next to git and sh, so the other commands of that folder stay.
export const pathWithout = (removed: string): string => {
  const folders = (process.env['PATH'] ?? '').split(delimiter);
  const holdsRemoved = (folder: string): boolean => existsSync(join(folder, removed));
  const otherCommands = tempDir(`callmap-path-without-${removed}-`);
  const linked = new Set<string>();
  for (const folder of folders.filter(holdsRemoved)) {
    for (const command of readdirSync(folder)) {
      if (command === removed || linked.has(command)) continue;
      symlinkSync(join(folder, command), join(otherCommands, command));
      linked.add(command);
    }
  }
  return [...folders.filter((folder) => !holdsRemoved(folder)), otherCommands].join(delimiter);
};
