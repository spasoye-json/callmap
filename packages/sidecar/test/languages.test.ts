import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSidecar } from '@archmap/sidecar';
import type { ExtractResult, OpenResult } from '@archmap/sidecar';

const GO_FIXTURE = fileURLToPath(new URL('../../extractor-go/fixture', import.meta.url));
const RUBY_FIXTURE = fileURLToPath(new URL('../../extractor-ruby/fixture', import.meta.url));

const sidecar = createSidecar();

const opened = async (repo: string, scope: readonly string[]): Promise<OpenResult> => {
  const response = await sidecar.handle({ command: 'open', repo, scope });
  if (!response.ok) throw new Error(response.error.message);
  return response.result as OpenResult;
};

const extracted = async (repo: string, scope: readonly string[]): Promise<ExtractResult> => {
  const { languages } = await opened(repo, scope);
  const response = await sidecar.handle({ command: 'extract', repo, scope, languages });
  if (!response.ok) throw new Error(response.error.message);
  return response.result as ExtractResult;
};

describe('the Go fixture', () => {
  it('opens as a repo that holds Go', async () => {
    expect((await opened(GO_FIXTURE, [])).languages).toEqual(['go']);
  });

  it('extracts into a summary under the go tag', async () => {
    expect((await extracted(GO_FIXTURE, [])).summary).toEqual({
      files: 8,
      edges: 6,
      languages: [{ language: 'go', files: 8, edges: 6 }],
    });
  });
});

describe('the Ruby fixture', () => {
  it('opens as a repo that holds Ruby', async () => {
    expect((await opened(RUBY_FIXTURE, [])).languages).toEqual(['ruby']);
  });

  it('extracts into a summary under the ruby tag', async () => {
    const { summary } = await extracted(RUBY_FIXTURE, []);
    expect(summary.files).toBe(21);
    expect(summary.languages).toMatchObject([{ language: 'ruby', files: 21 }]);
  });
});
