import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import type { ExtractorSettings } from './extractors.ts';
import { sha256OfFiles } from './file-hash.ts';

const ENTRIES_FOR_EACH_REPO = 20;

export interface CachedExtractor {
  readonly language: string;
  readonly lockFiles: readonly string[];
  readonly version: () => string;
}

export interface BaseKey extends ExtractorSettings {
  readonly repo: string;
  readonly checkout: string;
  readonly commit: string;
  readonly extractor: CachedExtractor;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export const callmapCacheFolder = (): string => {
  const home = process.env['XDG_CACHE_HOME'];
  return join(home !== undefined && isAbsolute(home) ? home : join(homedir(), '.cache'), 'callmap');
};

const lockHashOf = (checkout: string, lockFiles: readonly string[]): string =>
  sha256OfFiles(
    lockFiles
      .map((name) => ({ name, path: join(checkout, name) }))
      .filter(({ path }) => existsSync(path)),
  );

const entryNameOf = ({ checkout, commit, scope, tsconfig, extractor }: BaseKey): string =>
  sha256(
    JSON.stringify([
      extractor.language,
      commit,
      scope,
      tsconfig ?? null,
      lockHashOf(checkout, extractor.lockFiles),
      extractor.version(),
    ]),
  );

const cachedAt = (entry: string): GraphDocument | undefined => {
  try {
    const graph = readGraphDocument(JSON.parse(readFileSync(entry, 'utf8')));
    const now = new Date();
    utimesSync(entry, now, now);
    return graph;
  } catch {
    return undefined;
  }
};

const keepNewest = (folder: string): void => {
  const entries = readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ path: join(folder, name), time: statSync(join(folder, name)).mtimeMs }))
    .sort((first, second) => second.time - first.time || first.path.localeCompare(second.path));
  for (const { path } of entries.slice(ENTRIES_FOR_EACH_REPO)) rmSync(path, { force: true });
};

const store = (folder: string, entry: string, graph: GraphDocument): void => {
  try {
    mkdirSync(folder, { recursive: true });
    const partial = `${entry}.${process.pid}.partial`;
    writeFileSync(partial, JSON.stringify(graph));
    renameSync(partial, entry);
    keepNewest(folder);
  } catch {
    return;
  }
};

export const throughBaseCache = async (
  key: BaseKey,
  read: () => Promise<GraphDocument>,
): Promise<GraphDocument> => {
  const folder = join(callmapCacheFolder(), sha256(key.repo));
  const entry = join(folder, `${entryNameOf(key)}.json`);
  const cached = cachedAt(entry);
  if (cached !== undefined) return cached;
  const graph = await read();
  store(folder, entry, graph);
  return graph;
};
