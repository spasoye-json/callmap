import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';

export const assets = {
  TYPESCRIPT_EXTRACTOR: fileURLToPath(new URL('extract-typescript.js', import.meta.url)),
  LAYOUT_WORKER: new URL('layout-worker.js', import.meta.url),
  pageScript: () => Promise.resolve(readFileSync(new URL('page.js', import.meta.url), 'utf8')),
  pageStyle: () => readFileSync(new URL('page.css', import.meta.url), 'utf8'),
  extractorVersion: (typescript) => {
    const { name, version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { readonly name: string; readonly version: string };
    const source = readFileSync(new URL('extractor-source.sha256', import.meta.url), 'utf8');
    return `${name} ${version}\0typescript ${typescript}\0${source}`;
  },
} satisfies Assets;
