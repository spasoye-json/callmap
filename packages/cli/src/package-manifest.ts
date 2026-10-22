import { readFileSync } from 'node:fs';

export interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly license?: unknown;
  readonly workspaces?: readonly string[];
}

export const packageManifestAt = (path: string | URL): PackageManifest =>
  JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
