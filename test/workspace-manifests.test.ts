import { globSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');

interface Manifest {
  readonly description?: string;
  readonly license?: string;
  readonly workspaces?: readonly string[];
}

const manifestAt = (directory: string): Manifest =>
  JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest;

const rootManifest = manifestAt(REPO_ROOT);

const workspaceDirectories = (rootManifest.workspaces ?? [])
  .flatMap((pattern) => globSync(join(pattern, 'package.json'), { cwd: REPO_ROOT }))
  .map((path) => join(REPO_ROOT, path, '..'))
  .sort();

const manifests = [REPO_ROOT, ...workspaceDirectories].map(
  (directory) =>
    [relative(REPO_ROOT, join(directory, 'package.json')), manifestAt(directory)] as const,
);

describe('the workspace manifests', () => {
  it('finds the workspaces from the workspaces field of the root manifest', () => {
    expect(workspaceDirectories.map((directory) => relative(REPO_ROOT, directory))).toContain(
      join('packages', 'cli'),
    );
  });

  it.each(manifests)('%s carries the MIT license', (_path, manifest) => {
    expect(manifest.license).toBe('MIT');
  });

  it('describes Callmap at the root with the sentence of the README', () => {
    expect(rootManifest.description).toBe(
      'Callmap is a call graph reader for an engineer who still reads code.',
    );
  });
});
