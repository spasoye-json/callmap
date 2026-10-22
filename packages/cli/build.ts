import { chmodSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'rolldown';
import { assets } from './src/assets.ts';

const PACKAGE = import.meta.dirname;
const ROOT = join(PACKAGE, '..', '..');
const DIST = join(PACKAGE, 'dist');
const CLONE_ASSETS = join(PACKAGE, 'src', 'clone-assets.ts');
const PACKAGE_ASSETS = join(PACKAGE, 'src', 'package-assets.ts');

rmSync(DIST, { recursive: true, force: true });

await build({
  input: {
    cli: join(PACKAGE, 'src', 'cli.ts'),
    'layout-worker': join(PACKAGE, 'src', 'layout-worker.ts'),
    'extract-typescript': assets.TYPESCRIPT_EXTRACTOR,
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

writeFileSync(join(DIST, 'page.js'), await assets.pageScript());
writeFileSync(join(DIST, 'page.css'), assets.pageStyle());

for (const file of ['README.md', 'LICENSE']) copyFileSync(join(ROOT, file), join(PACKAGE, file));
