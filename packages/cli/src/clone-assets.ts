import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256OfFiles } from './file-hash.ts';

export { pageScript, pageStyle } from './page-build.ts';

export const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  import.meta.resolve('@callmap/extractor-typescript/cli'),
);

export const LAYOUT_WORKER = new URL('layout-worker.ts', import.meta.url);

const sourceFilesOf = (folder: string): readonly string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort();

export const extractorRelease = (): string => {
  const scope = dirname(createRequire(TYPESCRIPT_EXTRACTOR).resolve('@callmap/scope'));
  return sha256OfFiles(
    (
      [
        ['extractor', dirname(TYPESCRIPT_EXTRACTOR)],
        ['scope', scope],
      ] as const
    ).flatMap(([name, folder]) =>
      sourceFilesOf(folder).map((file) => ({ name: `${name}/${file}`, path: join(folder, file) })),
    ),
  );
};
