import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const PACKAGE_FILE = /^(package\.json|README\.md|LICENSE|dist\/[^/]+\.(js|css|sha256|txt))$/;

let tarball: Tarball;

const installedRepo = (): string => {
  const repo = featureBranchRepo();
  npm(repo, 'install', '--prefix', repo, '--no-save', '--no-audit', '--no-fund', tarball.path);
  return repo;
};

const runInstalledCallmap = (repo: string, out: string, cacheHome: string) =>
  spawnSync(join(repo, 'node_modules', '.bin', 'callmap'), ['review', '--no-open', '--out', out], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, XDG_CACHE_HOME: cacheHome },
  });

const cacheEntriesOf = (cacheHome: string): readonly string[] =>
  readdirSync(join(cacheHome, 'callmap'), { recursive: true, encoding: 'utf8' }).filter((entry) =>
    entry.endsWith('.json'),
  );

beforeAll(() => {
  tarball = packedCli();
});

describe('the packed @callmap/cli', () => {
  it('holds only the manifest, the README, the LICENSE and the built files', () => {
    expect(tarball.files.filter((path) => !PACKAGE_FILE.test(path))).toEqual([]);
    expect(tarball.files).toEqual(
      expect.arrayContaining([
        'package.json',
        'README.md',
        'LICENSE',
        'dist/cli.js',
        'dist/extractor-source.sha256',
        'dist/THIRD-PARTY-NOTICES.txt',
      ]),
    );
  });

  it('carries the name, the version, the license and the license text of each bundled third-party package', () => {
    const notices = readFileSync(
      join(installedRepo(), 'node_modules', '@callmap', 'cli', 'dist', 'THIRD-PARTY-NOTICES.txt'),
      'utf8',
    );
    expect(notices).toMatch(
      /^elkjs \d+\.\d+\.\d+\nLicense: EPL-2\.0 OR GPL-3\.0-or-later\n\n# Eclipse Public License/m,
    );
    expect(notices).toMatch(/^@codemirror\/view \d+\.\d+\.\d+\nLicense: MIT\n\nMIT License/m);
    expect(notices).not.toMatch(/^(@callmap\/|typescript )/m);
  });

  it('installs in a TypeScript repo, and its callmap command writes the reader page of the review', () => {
    const repo = installedRepo();
    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = runInstalledCallmap(repo, out, tempDir('callmap-cache-'));
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

  it('reads the base again after a build from a changed extractor source', () => {
    const repo = installedRepo();
    const cacheHome = tempDir('callmap-cache-');
    const out = join(tempDir('callmap-out-'), 'review.html');
    expect(runInstalledCallmap(repo, out, cacheHome).status).toBe(0);
    expect(runInstalledCallmap(repo, out, cacheHome).status).toBe(0);
    expect(cacheEntriesOf(cacheHome)).toHaveLength(1);

    writeFileSync(
      join(repo, 'node_modules', '@callmap', 'cli', 'dist', 'extractor-source.sha256'),
      '0'.repeat(64),
    );
    expect(runInstalledCallmap(repo, out, cacheHome).status).toBe(0);
    expect(cacheEntriesOf(cacheHome)).toHaveLength(2);
  });
});
