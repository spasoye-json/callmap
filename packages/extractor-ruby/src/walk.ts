/**
 * The Ruby extractor's walk of a repo's filesystem. The core never reads one (ADR-0009); an
 * extractor is the process that turns a directory on disk into data.
 */

import { readdirSync } from 'node:fs';
import { isSkippedDirectory } from '@callmap/scope';

export interface RubyTree {
  readonly files: readonly string[];
  /** Each `.gemspec`, whose folder is a load unit of its own. */
  readonly gemspecs: readonly string[];
}

/**
 * Every Ruby file of the repo by repo-relative path, in path order, whatever the scope. A class
 * takes its methods from every body in its load unit, so which methods a class has is a question
 * about the whole unit, and the scope only decides which of them the document claims. A symbolic
 * link is not followed, so a link out of the repo cannot pull a foreign file in and a link back
 * into it cannot walk forever.
 */
export const rubyTreeOf = (repo: string): RubyTree => {
  const found: string[] = [];
  const gemspecs: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(`${repo}/${directory}`, { withFileTypes: true })) {
      if (isSkippedDirectory(entry.name)) continue;
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.rb')) found.push(path);
      else if (entry.isFile() && entry.name.endsWith('.gemspec')) gemspecs.push(path);
    }
  };

  walk('');
  return { files: found.sort(), gemspecs: gemspecs.sort() };
};
