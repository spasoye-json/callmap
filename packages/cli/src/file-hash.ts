import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface NamedFile {
  readonly name: string;
  readonly path: string;
}

export const sha256OfFiles = (files: readonly NamedFile[], header = ''): string => {
  const hash = createHash('sha256').update(header);
  for (const { name, path } of files) {
    hash.update(`${name}\0`).update(readFileSync(path)).update('\0');
  }
  return hash.digest('hex');
};
