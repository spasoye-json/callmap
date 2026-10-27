import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROGRAM = join(import.meta.dirname, '..', 'go');

describe('the Go tests of the extractor', () => {
  it('pass with the local go and the vendored modules', () => {
    const finished = spawnSync('go', ['test', './...'], {
      cwd: PROGRAM,
      encoding: 'utf8',
      env: { ...process.env, GOTOOLCHAIN: 'local', GOPROXY: 'off', GOFLAGS: '-mod=vendor' },
    });
    expect(finished.error).toBeUndefined();
    expect(finished.status, `${finished.stdout}${finished.stderr}`).toBe(0);
  }, 120_000);
});
