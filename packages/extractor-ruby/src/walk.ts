/**
 * The Ruby extractor's walk of a repo's filesystem. The core never reads one (ADR-0009); an
 * extractor is the process that turns a directory on disk into data.
 */

import { readdirSync } from 'node:fs';

/**
 * Directories that hold no source of the repo being mapped. `vendor` is where Bundler installs
 * other people's gems, `node_modules` holds other people's packages, and a dot directory holds a
 * tool's bookkeeping.
 */
const skipped = (name: string): boolean =>
  name === 'vendor' || name === 'node_modules' || name.startsWith('.');

/**
 * Every Ruby file of the repo by repo-relative path, in path order, whatever the scope. Zeitwerk
 * names a constant by where its file sits, so which constants an app defines is a question about
 * the whole app, and the scope only decides which of them the document claims. A symbolic link is
 * not followed, so a link out of the repo cannot pull a foreign file in and a link back into it
 * cannot walk forever.
 */
export const rubyFilesOf = (repo: string): readonly string[] => {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(`${repo}/${directory}`, { withFileTypes: true })) {
      if (skipped(entry.name)) continue;
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.rb')) found.push(path);
    }
  };

  walk('');
  return found.sort();
};
