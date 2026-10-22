import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  new URL('extract-typescript.js', import.meta.url),
);

export const LAYOUT_WORKER = new URL('layout-worker.js', import.meta.url);

export const pageScript = (): Promise<string> =>
  Promise.resolve(readFileSync(new URL('page.js', import.meta.url), 'utf8'));

export const pageStyle = (): string => readFileSync(new URL('page.css', import.meta.url), 'utf8');

export const extractorRelease = (): string => {
  const { name, version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { readonly name: string; readonly version: string };
  return `${name} ${version}`;
};
