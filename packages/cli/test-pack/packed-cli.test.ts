import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { featureBranchRepo, goRepo } from '../test/fixture-repo.ts';
import { pageDataOf } from '../test/reader-page.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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
    npm(REPO_ROOT, 'pack', '--json', '--workspace', '@callmap/cli', '--pack-destination', folder),
  ) as readonly PackReport[];
  if (report === undefined) throw new Error('npm pack wrote no tarball');
  return { path: join(folder, report.filename), files: report.files.map(({ path }) => path) };
};

const PACKAGE_FILE =
  /^(package\.json|README\.md|LICENSE|dist\/[^/]+\.(js|css|sha256|txt)|dist\/go\/(.+\.go|go\.(mod|sum)|vendor\/modules\.txt|vendor\/.+\/(LICENSE|PATENTS)))$/;

let tarball: Tarball;

const installedRepo = (tarballPath: string, repo = featureBranchRepo()): string => {
  npm(repo, 'install', '--prefix', repo, '--no-save', '--no-audit', '--no-fund', tarballPath);
  return repo;
};

const runInstalledCallmap = (
  repo: string,
  out: string,
  cacheHome: string,
  env: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> =>
  spawnSync(join(repo, 'node_modules', '.bin', 'callmap'), ['review', '--no-open', '--out', out], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, XDG_CACHE_HOME: cacheHome, ...env },
  });

const offlineGo = (): NodeJS.ProcessEnv => ({
  GOPROXY: 'off',
  GOFLAGS: '-mod=mod',
  GOMODCACHE: tempDir('callmap-gomodcache-'),
});

const goExtractorBinariesOf = (cacheHome: string): readonly string[] =>
  readdirSync(join(cacheHome, 'callmap', 'go-extractor'), {
    recursive: true,
    encoding: 'utf8',
  }).filter((entry) => entry.endsWith('callmap-extract-go'));

const pathWithAnotherGoVersion = (): string => {
  const go = join(execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim(), 'bin', 'go');
  const bin = tempDir('callmap-go-');
  writeFileSync(
    join(bin, 'go'),
    `#!/bin/sh\nif [ "$*" = version ]; then echo "$('${go}' version) next"; exit 0; fi\nexec '${go}' "$@"\n`,
  );
  chmodSync(join(bin, 'go'), 0o755);
  return `${bin}${delimiter}${process.env['PATH'] ?? ''}`;
};

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

  it('holds the source of the Go extractor with its vendored modules', () => {
    expect(tarball.files).toEqual(
      expect.arrayContaining([
        'dist/extract-go.js',
        'dist/go-extractor-source.sha256',
        'dist/go/go.mod',
        'dist/go/go.sum',
        'dist/go/main.go',
        'dist/go/vendor/modules.txt',
        'dist/go/vendor/golang.org/x/tools/LICENSE',
        'dist/go/vendor/golang.org/x/tools/go/packages/packages.go',
      ]),
    );
  });

  it('carries the name, the version, the license and the license text of each bundled third-party package', () => {
    const notices = readFileSync(
      join(
        installedRepo(tarball.path),
        'node_modules',
        '@callmap',
        'cli',
        'dist',
        'THIRD-PARTY-NOTICES.txt',
      ),
      'utf8',
    );
    expect(notices).toMatch(
      /^elkjs \d+\.\d+\.\d+\nLicense: EPL-2\.0 OR GPL-3\.0-or-later\n\n# Eclipse Public License/m,
    );
    expect(notices).toMatch(/^@codemirror\/view \d+\.\d+\.\d+\nLicense: MIT\n\nMIT License/m);
    expect(notices).not.toMatch(/^(@callmap\/|typescript )/m);
    for (const module of ['golang.org/x/tools', 'golang.org/x/mod', 'golang.org/x/sync'])
      expect(notices).toMatch(
        new RegExp(
          `^${module.replaceAll('.', '\\.')} v\\d+\\.\\d+\\.\\d+\nLicense: BSD-3-Clause\n\nCopyright 20\\d\\d The Go Authors\\.`,
          'm',
        ),
      );
  });

  it('installs in a TypeScript repo, and its callmap command writes the reader page of the review', () => {
    const repo = installedRepo(tarball.path);
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
    const repo = installedRepo(tarball.path);
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

  it('installs in a repo with Go, builds the Go extractor offline, and its page holds the Go functions and calls', () => {
    const repo = installedRepo(tarball.path, goRepo());
    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = runInstalledCallmap(repo, out, tempDir('callmap-cache-'), offlineGo());
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    const { review } = pageDataOf(readFileSync(out, 'utf8'));
    expect(review.functions.map(({ id, mark }) => `${mark} ${id}`)).toEqual(
      expect.arrayContaining(['changed checkout/checkout.go#Total', 'added money/money.go#Round']),
    );
    expect(review.calls.map(({ caller, callee, mark }) => `${mark} ${caller} ${callee}`)).toEqual(
      expect.arrayContaining(['added checkout/checkout.go#Total money/money.go#Round']),
    );
    expect(review.resolutionRates.map(({ language }) => language)).toEqual(['go', 'typescript']);
  });

  it('builds the Go extractor once into the cache, and again for another go version', () => {
    const repo = installedRepo(tarball.path, goRepo());
    const cacheHome = tempDir('callmap-cache-');
    const out = join(tempDir('callmap-out-'), 'review.html');
    expect(runInstalledCallmap(repo, out, cacheHome, offlineGo()).status).toBe(0);
    const [binary] = goExtractorBinariesOf(cacheHome);
    if (binary === undefined) throw new Error('the review built no Go extractor');
    const built = statSync(join(cacheHome, 'callmap', 'go-extractor', binary)).mtimeMs;

    expect(runInstalledCallmap(repo, out, cacheHome, offlineGo()).status).toBe(0);
    expect(goExtractorBinariesOf(cacheHome)).toEqual([binary]);
    expect(statSync(join(cacheHome, 'callmap', 'go-extractor', binary)).mtimeMs).toBe(built);

    const next = runInstalledCallmap(repo, out, cacheHome, {
      ...offlineGo(),
      PATH: pathWithAnotherGoVersion(),
    });
    expect(next.status, next.stderr).toBe(0);
    expect(goExtractorBinariesOf(cacheHome)).toHaveLength(2);
  });
});
