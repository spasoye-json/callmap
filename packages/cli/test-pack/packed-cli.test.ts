import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { featureBranchRepo } from '../test/fixture-repo.ts';
import { pageDataOf } from '../test/reader-page.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface Tarball {
  readonly path: string;
  readonly files: readonly string[];
}

interface PackReport {
  readonly filename: string;
  readonly files: readonly { readonly path: string }[];
}

const npm = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const packedCli = (): Tarball => {
  const folder = tempDir('callmap-pack-');
  const [report] = JSON.parse(
    npm(ROOT, 'pack', '--json', '--workspace', '@callmap/cli', '--pack-destination', folder),
  ) as readonly PackReport[];
  if (report === undefined) throw new Error('npm pack wrote no tarball');
  return { path: join(folder, report.filename), files: report.files.map(({ path }) => path) };
};

const PACKAGE_FILE = /^(package\.json|README\.md|LICENSE|dist\/[^/]+\.(js|css))$/;

let tarball: Tarball;

beforeAll(() => {
  tarball = packedCli();
});

describe('the packed @callmap/cli', () => {
  it('holds only the manifest, the README, the LICENSE and the built files', () => {
    expect(tarball.files.filter((path) => !PACKAGE_FILE.test(path))).toEqual([]);
    expect(tarball.files).toEqual(
      expect.arrayContaining(['package.json', 'README.md', 'LICENSE', 'dist/cli.js']),
    );
  });

  it('installs in a TypeScript repo, and its callmap command writes the reader page of the review', () => {
    const repo = featureBranchRepo();
    npm(repo, 'install', '--prefix', repo, '--no-save', '--no-audit', '--no-fund', tarball.path);
    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = spawnSync(
      join(repo, 'node_modules', '.bin', 'callmap'),
      ['review', '--no-open', '--out', out],
      {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, XDG_CACHE_HOME: tempDir('callmap-cache-') },
      },
    );
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    expect(finished.stdout.trim()).toBe(out);
    const marks = pageDataOf(readFileSync(out, 'utf8')).review.functions.map(
      ({ id, mark }) => `${mark} ${id}`,
    );
    expect(marks).toEqual(
      expect.arrayContaining([
        'added src/alerts.ts#relay',
        'changed src/alerts.ts#alert',
        'removed src/cart.ts#legacyTotal',
      ]),
    );
  });
});
