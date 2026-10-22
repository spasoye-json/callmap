import { chmodSync, copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'rolldown';
import { assets } from './src/assets.ts';
import { extractorSourceFiles } from './src/clone-assets.ts';
import { sha256OfFiles } from './src/file-hash.ts';
import { pageBundle } from './src/page-build.ts';

const PACKAGE = import.meta.dirname;
const REPO_ROOT = join(PACKAGE, '..', '..');
const DIST = join(PACKAGE, 'dist');
const CLONE_ASSETS = join(PACKAGE, 'src', 'clone-assets.ts');
const PACKAGE_ASSETS = join(PACKAGE, 'src', 'package-assets.ts');

const PACKAGE_FOLDER = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const LICENSE_FILE = /^(licen[cs]e|copying)(\..*)?$/i;

interface Notice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string;
}

const noticeOf = (folder: string): Notice => {
  const { name, version, license } = JSON.parse(
    readFileSync(join(folder, 'package.json'), 'utf8'),
  ) as { readonly name: string; readonly version: string; readonly license?: unknown };
  const file = readdirSync(folder).find((entry) => LICENSE_FILE.test(entry));
  if (typeof license !== 'string' || file === undefined)
    throw new Error(`${name} ${version} names no license or has no license file`);
  return { name, version, license, text: readFileSync(join(folder, file), 'utf8').trim() };
};

const noticesOf = (moduleIds: readonly string[]): string => {
  const folders = new Set(moduleIds.flatMap((id) => PACKAGE_FOLDER.exec(id)?.slice(1, 2) ?? []));
  const notices = new Map(
    [...folders].map(noticeOf).map((notice) => [`${notice.name} ${notice.version}`, notice]),
  );
  return [
    'Callmap bundles the third-party packages below. Each one keeps its own license.\n',
    ...[...notices.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([title, { license, text }]) => `${title}\nLicense: ${license}\n\n${text}\n`),
  ].join(`\n${'-'.repeat(72)}\n\n`);
};

rmSync(DIST, { recursive: true, force: true });

const { output } = await build({
  input: {
    cli: join(PACKAGE, 'src', 'cli.ts'),
    'layout-worker': join(PACKAGE, 'src', 'layout-worker.ts'),
    'extract-typescript': assets.typescriptExtractor,
  },
  platform: 'node',
  external: ['typescript'],
  logLevel: 'warn',
  plugins: [
    {
      name: 'package-assets',
      resolveId: async function (source, importer, options) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved?.id === CLONE_ASSETS ? PACKAGE_ASSETS : null;
      },
    },
  ],
  output: { dir: DIST, format: 'esm' },
});

// npm makes a bin executable only when it links it, and a linked clone runs each new build.
chmodSync(join(DIST, 'cli.js'), 0o755);

const page = await pageBundle();
writeFileSync(join(DIST, 'page.js'), page.script);
writeFileSync(join(DIST, 'page.css'), assets.pageStyle());
writeFileSync(join(DIST, 'extractor-source.sha256'), sha256OfFiles(extractorSourceFiles()));
writeFileSync(
  join(DIST, 'THIRD-PARTY-NOTICES.txt'),
  noticesOf([
    ...output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : [])),
    ...page.moduleIds,
  ]),
);

for (const file of ['README.md', 'LICENSE'])
  copyFileSync(join(REPO_ROOT, file), join(PACKAGE, file));
