import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { packageManifestAt, typescriptVersionFor } from './package-manifest.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(new URL('extract-typescript.js', import.meta.url));

export const assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  layoutWorker: new URL('layout-worker.js', import.meta.url),
  pageScript: () => Promise.resolve(readFileSync(new URL('page.js', import.meta.url), 'utf8')),
  pageStyle: () => readFileSync(new URL('page.css', import.meta.url), 'utf8'),
  extractorVersion: () => {
    const { name, version } = packageManifestAt(new URL('../package.json', import.meta.url));
    const source = readFileSync(new URL('extractor-source.sha256', import.meta.url), 'utf8');
    return `${name} ${version}\0typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0${source}`;
  },
} satisfies Assets;
