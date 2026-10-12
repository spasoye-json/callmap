import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSidecar, REGISTERED_EXTRACTORS } from '@archmap/sidecar';
import type {
  ExtractorRegistration,
  ExtractorRun,
  ExtractResult,
  OpenResult,
} from '@archmap/sidecar';

const TYPESCRIPT_FIXTURE = fileURLToPath(
  new URL('../../extractor-typescript/fixture', import.meta.url),
);

describe('open', () => {
  it('detects the languages a repo holds in scope', async () => {
    const sidecar = createSidecar();
    const response = await sidecar.handle({
      command: 'open',
      repo: TYPESCRIPT_FIXTURE,
      scope: ['src/**'],
    });
    expect(response).toEqual({
      ok: true,
      result: { repo: TYPESCRIPT_FIXTURE, scope: ['src/**'], languages: ['typescript'] },
    });
  });
});

describe('extract', () => {
  it('runs the extractor of each language and counts the merged reference graph', async () => {
    const sidecar = createSidecar();
    const response = await sidecar.handle({
      command: 'extract',
      repo: TYPESCRIPT_FIXTURE,
      scope: ['src/**'],
      languages: ['typescript'],
    });
    if (!response.ok) throw new Error(response.error.message);
    const result = response.result as ExtractResult;
    expect(result.summary).toEqual({
      files: 8,
      edges: 9,
      languages: [{ language: 'typescript', files: 8, edges: 9 }],
    });
    expect(result.documents.map((document) => [document.language, document.scope])).toEqual([
      ['typescript', ['src/**']],
    ]);
  });
});

describe('a language registered beside the ones version one ships', () => {
  const mixedRepo = (): string => {
    const repo = mkdtempSync(join(tmpdir(), 'archmap-sidecar-'));
    mkdirSync(join(repo, 'web'));
    mkdirSync(join(repo, 'svc'));
    writeFileSync(join(repo, 'web/a.ts'), "import { b } from './b';\nexport const a = b;\n");
    writeFileSync(join(repo, 'web/b.ts'), 'export const b = 1;\n');
    writeFileSync(join(repo, 'svc/main.zig'), 'pub fn main() void {}\n');
    writeFileSync(join(repo, 'svc/util.zig'), 'pub fn main() void {}\n');
    return repo;
  };

  const zigExtractor = (emit: (run: ExtractorRun) => unknown): ExtractorRegistration => ({
    language: 'zig',
    claims: (path) => path.endsWith('.zig'),
    extract: (run) => Promise.resolve(emit(run)),
  });

  const zigDocument = (run: ExtractorRun) => ({
    language: 'zig',
    scope: run.scope,
    files: ['svc/main.zig', 'svc/util.zig'],
    edges: [{ from: 'svc/main.zig', to: 'svc/util.zig' }],
  });

  it('is detected and extracted through the same two commands', async () => {
    const repo = mixedRepo();
    const sidecar = createSidecar({
      extractors: [...REGISTERED_EXTRACTORS, zigExtractor(zigDocument)],
    });

    const opened = await sidecar.handle({ command: 'open', repo, scope: [] });
    if (!opened.ok) throw new Error(opened.error.message);
    const { languages } = opened.result as OpenResult;
    expect(languages).toEqual(['typescript', 'zig']);

    const extracted = await sidecar.handle({ command: 'extract', repo, scope: [], languages });
    if (!extracted.ok) throw new Error(extracted.error.message);
    expect((extracted.result as ExtractResult).summary).toEqual({
      files: 4,
      edges: 2,
      languages: [
        { language: 'typescript', files: 2, edges: 1 },
        { language: 'zig', files: 2, edges: 1 },
      ],
    });
  });

  it('is left out of open when no file in scope is one it reads', async () => {
    const repo = mixedRepo();
    const sidecar = createSidecar({
      extractors: [...REGISTERED_EXTRACTORS, zigExtractor(zigDocument)],
    });
    const opened = await sidecar.handle({ command: 'open', repo, scope: ['web/**'] });
    expect(opened).toMatchObject({ ok: true, result: { languages: ['typescript'] } });
  });
});

describe('a request the sidecar refuses', () => {
  const refusalOf = async (request: unknown, extractors?: readonly ExtractorRegistration[]) => {
    const sidecar = createSidecar(extractors === undefined ? {} : { extractors });
    const response = await sidecar.handle(request);
    if (response.ok) throw new Error('the request was answered, not refused');
    return response.error.code;
  };

  const claimsAll = (language: string, emitted: unknown): ExtractorRegistration => ({
    language,
    claims: () => true,
    extract: () => Promise.resolve(emitted),
  });

  it('names a command the sidecar does not know', async () => {
    expect(await refusalOf({ command: 'paint' })).toBe('unknown-command');
  });

  it('is not an object at all', async () => {
    expect(await refusalOf('open')).toBe('malformed-request');
  });

  it('leaves the scope out, so it cannot say what it was pointed at', async () => {
    expect(await refusalOf({ command: 'open', repo: TYPESCRIPT_FIXTURE })).toBe(
      'malformed-request',
    );
  });

  it('names a repo that is not a directory', async () => {
    const missing = join(tmpdir(), 'archmap-no-such-repo');
    expect(await refusalOf({ command: 'open', repo: missing, scope: [] })).toBe('repo-not-found');
  });

  it('asks for a language no extractor is registered for', async () => {
    const request = {
      command: 'extract',
      repo: TYPESCRIPT_FIXTURE,
      scope: [],
      languages: ['cobol'],
    };
    expect(await refusalOf(request)).toBe('unknown-language');
  });

  it('meets an extractor process that refuses the repo', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'archmap-sidecar-'));
    writeFileSync(join(repo, 'tsconfig.json'), '{ not json');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    const request = { command: 'extract', repo, scope: [], languages: ['typescript'] };
    expect(await refusalOf(request)).toBe('extractor-failed');
  });

  it('meets an extractor that emits a document the contract refuses', async () => {
    const request = { command: 'extract', repo: TYPESCRIPT_FIXTURE, scope: [], languages: ['go'] };
    const scopeless = claimsAll('go', { language: 'go', files: [], edges: [] });
    expect(await refusalOf(request, [scopeless])).toBe('extractor-failed');
  });

  it('merges two documents that claim one file under two languages', async () => {
    const claiming = (language: string) =>
      claimsAll(language, { language, scope: [], files: ['src/a.x'], edges: [] });
    const request = {
      command: 'extract',
      repo: TYPESCRIPT_FIXTURE,
      scope: [],
      languages: ['go', 'ruby'],
    };
    expect(await refusalOf(request, [claiming('go'), claiming('ruby')])).toBe('graph-refused');
  });
});
