import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ENV_NAME = 'CALLMAP_CHROMIUM';
const COMMANDS = ['chromium-browser', 'chromium'];
const CACHED_EXECUTABLES = [
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
];

const playwrightCache = (): string =>
  process.env['PLAYWRIGHT_BROWSERS_PATH'] ??
  (process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
    : join(homedir(), '.cache', 'ms-playwright'));

const revisionOf = (folder: string): number => Number(folder.slice('chromium-'.length));

const cachedChromium = (): string | undefined => {
  const expected = chromium.executablePath();
  if (existsSync(expected)) return expected;
  const cache = playwrightCache();
  if (!existsSync(cache)) return undefined;
  return readdirSync(cache)
    .filter((folder) => /^chromium-\d+$/.test(folder))
    .sort((left, right) => revisionOf(right) - revisionOf(left))
    .flatMap((folder) => CACHED_EXECUTABLES.map((executable) => join(cache, folder, executable)))
    .find((path) => existsSync(path));
};

const commandOnPath = (): string | undefined => {
  for (const command of COMMANDS) {
    try {
      return execFileSync('which', [command], { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch {
      continue;
    }
  }
  return undefined;
};

export const chromiumExecutable = (): string => {
  const chosen = process.env[ENV_NAME];
  if (chosen !== undefined && chosen !== '') {
    if (existsSync(chosen)) return chosen;
    throw new Error(`${ENV_NAME} names ${chosen}, but no file is there.`);
  }
  const found = cachedChromium() ?? commandOnPath();
  if (found !== undefined) return found;
  throw new Error(
    [
      'The browser tests found no Chromium.',
      `Set ${ENV_NAME} to the path of a Chromium executable,`,
      'or install one with "npx playwright install chromium",',
      `or put ${COMMANDS.join(' or ')} on the PATH.`,
    ].join(' '),
  );
};
