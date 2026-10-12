/**
 * What belongs to the person running the app and not to the repo: their AI provider key and their
 * monthly spend. Both live in a config directory outside every repo, so neither is ever committed
 * with the map file (ADR-0007 holds the map, not the account).
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseSpend, serialiseSpend } from '@archmap/discovery';
import type { SpendRecord } from '@archmap/discovery';

const CREDENTIALS_FILE = 'credentials.json';
const SPEND_FILE = 'spend.json';

/** `ARCHMAP_CONFIG_DIR` when the shell sets one, else the XDG config directory. */
export const defaultConfigDir = (): string =>
  process.env['ARCHMAP_CONFIG_DIR'] ??
  join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'archmap');

export interface LocalStore {
  readKey(): string | null;
  writeKey(key: string): void;
  readSpend(): SpendRecord;
  writeSpend(record: SpendRecord): void;
}

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (_error) {
    return null;
  }
};

export const createLocalStore = (configDir: string): LocalStore => {
  const credentials = join(configDir, CREDENTIALS_FILE);
  const spend = join(configDir, SPEND_FILE);
  const ensureDir = (): void => {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
  };
  return {
    readKey: () => {
      const text = readText(credentials);
      if (text === null) return null;
      try {
        const value: unknown = JSON.parse(text);
        const key = (value as Record<string, unknown> | null)?.['anthropicApiKey'];
        return typeof key === 'string' && key !== '' ? key : null;
      } catch (_error) {
        return null;
      }
    },
    writeKey: (key) => {
      ensureDir();
      writeFileSync(credentials, `${JSON.stringify({ anthropicApiKey: key }, null, 2)}\n`, {
        mode: 0o600,
      });
      // The mode option only applies when the file is created, so an older file is narrowed too.
      chmodSync(credentials, 0o600);
    },
    readSpend: () => parseSpend(readText(spend) ?? '{}'),
    writeSpend: (record) => {
      ensureDir();
      writeFileSync(spend, serialiseSpend(record));
    },
  };
};
