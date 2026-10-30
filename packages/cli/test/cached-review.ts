import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

export const reviewOf = (repo: string, cacheHome: string, path?: string) => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmap(
    ['review', repo, '--no-open', '--out', out],
    undefined,
    cacheHome,
    path === undefined ? {} : { PATH: path },
  );
  expect(finished.status, finished.stderr).toBe(0);
  return { html: readFileSync(out, 'utf8'), stderr: finished.stderr };
};

export const cacheEntriesOf = (cacheHome: string): readonly string[] =>
  readdirSync(join(cacheHome, 'callmap'), { recursive: true, encoding: 'utf8' }).filter((entry) =>
    entry.endsWith('.json'),
  );
