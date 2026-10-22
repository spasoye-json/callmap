import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly license?: unknown;
  readonly workspaces?: readonly string[];
}

export const packageManifestAt = (path: string | URL): PackageManifest =>
  JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;

export const typescriptVersionFor = (extractor: string): string =>
  packageManifestAt(createRequire(extractor).resolve('typescript/package.json')).version;
