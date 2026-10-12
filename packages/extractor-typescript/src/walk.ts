/**
 * The one place in Archmap that reads a repo's filesystem. The core never does (ADR-0009); an
 * extractor is the process that turns a directory on disk into data.
 */

import { readdirSync } from 'node:fs';
import { inScope } from './scope.ts';

/**
 * What the TypeScript extractor understands. JavaScript rides with TypeScript, because they share
 * one module resolution and version one ships them as one extractor (ADR-0009).
 */
const UNDERSTOOD = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Directories that hold no source of the repo being mapped. `node_modules` holds other people's
 * repos, and a dot directory holds a tool's bookkeeping.
 */
const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');

/**
 * Whether a file name is one this extractor reads. The host asks the same question of every file
 * in scope to detect the language, so detection and extraction cannot disagree on a file.
 */
export const understood = (name: string): boolean =>
  UNDERSTOOD.some((extension) => name.endsWith(extension));

/**
 * Every source file of the repo that the scope takes in, by repo-relative path, in path order.
 * A symbolic link is not followed, so a link out of the repo cannot pull a foreign file in and a
 * link back into it cannot walk forever.
 */
export const sourceFilesInScope = (repo: string, scope: readonly string[]): readonly string[] => {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(`${repo}/${directory}`, { withFileTypes: true })) {
      if (skipped(entry.name)) continue;
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && understood(entry.name) && inScope(path, scope)) found.push(path);
    }
  };

  walk('');
  return found.sort();
};
