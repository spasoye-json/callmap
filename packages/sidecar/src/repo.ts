/**
 * The repo as the sidecar sees it before any extractor runs: a directory, and the files in it that
 * the scope takes in. This is what language detection reads.
 */

import { readdirSync, statSync } from 'node:fs';
import { inScope, isSkippedDirectory } from '@archmap/scope';

export const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch (_error) {
    return false;
  }
};

/** Every file in scope, by repo-relative path, in path order. Symbolic links are not followed. */
export const filesInScope = (repo: string, scope: readonly string[]): readonly string[] => {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(`${repo}/${directory}`, { withFileTypes: true })) {
      if (isSkippedDirectory(entry.name)) continue;
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && inScope(path, scope)) found.push(path);
    }
  };
  walk('');
  return found.sort();
};
