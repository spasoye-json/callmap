import { globSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = join(import.meta.dirname, '..');

interface Manifest {
  readonly description?: string;
  readonly license?: string;
  readonly workspaces?: readonly string[];
}

const manifestAt = (directory: string): Manifest =>
  JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest;

const rootManifest = manifestAt(ROOT_DIR);

const workspaceDirectories = (rootManifest.workspaces ?? [])
  .flatMap((pattern) => globSync(join(pattern, 'package.json'), { cwd: ROOT_DIR }))
  .map((path) => join(ROOT_DIR, path, '..'))
  .sort();

const manifests = [ROOT_DIR, ...workspaceDirectories].map(
  (directory) =>
    [relative(ROOT_DIR, join(directory, 'package.json')), manifestAt(directory)] as const,
);

describe('the workspace manifests', () => {
  it('finds the workspaces from the workspaces field of the root manifest', () => {
    expect(workspaceDirectories.map((directory) => relative(ROOT_DIR, directory))).toContain(
      join('packages', 'cli'),
    );
  });

  it.each(manifests)('%s carries the MIT license', (_path, manifest) => {
    expect(manifest.license).toBe('MIT');
  });
});
