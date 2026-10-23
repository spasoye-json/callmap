import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { sha256OfFiles } from './file-hash.ts';
import type { NamedFile } from './file-hash.ts';
import { typescriptVersionFor } from './package-manifest.ts';
import { pageScript, pageStyle } from './page-build.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  import.meta.resolve('@callmap/extractor-typescript/cli'),
);

const sourceFilesOf = (folder: string): readonly string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort();

export const extractorSourceFiles = (): readonly NamedFile[] => {
  const scope = dirname(createRequire(TYPESCRIPT_EXTRACTOR).resolve('@callmap/scope'));
  return (
    [
      ['extractor', dirname(TYPESCRIPT_EXTRACTOR)],
      ['scope', scope],
    ] as const
  ).flatMap(([name, folder]) =>
    sourceFilesOf(folder).map((file) => ({ name: `${name}/${file}`, path: join(folder, file) })),
  );
};

export const assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  layoutWorker: new URL('layout-worker.ts', import.meta.url),
  pageScript,
  pageStyle,
  extractorVersion: () =>
    sha256OfFiles(
      extractorSourceFiles(),
      `typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0`,
    ),
} satisfies Assets;
