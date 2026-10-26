import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
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

const GO_EXTRACTOR = fileURLToPath(import.meta.resolve('@callmap/extractor-go/cli'));

export const GO_PROGRAM = join(dirname(GO_EXTRACTOR), '..', 'go');

export const goSourceFiles = (): readonly NamedFile[] => [
  ...sourceFilesOf(dirname(GO_EXTRACTOR)).map((file) => ({
    name: `src/${file}`,
    path: join(dirname(GO_EXTRACTOR), file),
  })),
  ...readdirSync(GO_PROGRAM, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .map((path) => ({ name: `go/${relative(GO_PROGRAM, path)}`, path })),
];

export const assets: Assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  layoutWorker: new URL('layout-worker.ts', import.meta.url),
  pageScript,
  pageStyle,
  typescriptExtractorVersion: () =>
    sha256OfFiles(
      extractorSourceFiles(),
      `typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0`,
    ),
  goExtractor: GO_EXTRACTOR,
  goExtractorVersion: (goVersion) => sha256OfFiles(goSourceFiles(), `${goVersion}\0`),
  goExtractorEnv: () => ({}),
};
