import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { callmapCacheFolder } from './base-cache.ts';
import { packageManifestAt, typescriptVersionFor } from './package-manifest.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(new URL('extract-typescript.js', import.meta.url));

const packageNameAndVersion = (): string => {
  const { name, version } = packageManifestAt(new URL('../package.json', import.meta.url));
  return `${name} ${version}`;
};

const goExtractorVersion = (): string =>
  [
    packageNameAndVersion(),
    readFileSync(new URL('go-extractor-source.sha256', import.meta.url), 'utf8'),
    execFileSync('go', ['version'], { encoding: 'utf8' }),
  ].join('\0');

export const assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  layoutWorker: new URL('layout-worker.js', import.meta.url),
  pageScript: () => Promise.resolve(readFileSync(new URL('page.js', import.meta.url), 'utf8')),
  pageStyle: () => readFileSync(new URL('page.css', import.meta.url), 'utf8'),
  typescriptExtractorVersion: () => {
    const source = readFileSync(new URL('extractor-source.sha256', import.meta.url), 'utf8');
    return `${packageNameAndVersion()}\0typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0${source}`;
  },
  goExtractor: fileURLToPath(new URL('extract-go.js', import.meta.url)),
  goExtractorVersion,
  goExtractorEnv: () => ({
    CALLMAP_GO_EXTRACTOR_SOURCE: fileURLToPath(new URL('go', import.meta.url)),
    CALLMAP_GO_EXTRACTOR_BINARY: join(
      callmapCacheFolder(),
      'go-extractor',
      createHash('sha256').update(goExtractorVersion()).digest('hex'),
      'callmap-extract-go',
    ),
  }),
} satisfies Assets;
