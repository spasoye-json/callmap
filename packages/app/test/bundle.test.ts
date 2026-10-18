import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const APP = join(import.meta.dirname, '..');

/** Every attribute value in a page that makes the webview fetch something. */
const assetReferences = (html: string): readonly string[] =>
  [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map(([, reference]) => reference ?? '');

const filesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

describe('the built app', () => {
  let out = '';

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'archmap-app-build-'));
    await build({ root: APP, logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
  }, 60_000);

  it('loads every asset from its own bundle, so the first open needs no network', () => {
    const references = assetReferences(readFileSync(join(out, 'index.html'), 'utf8'));
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference, reference).not.toMatch(/^(?:[a-z]+:)?\/\//i);
      expect(existsSync(join(out, reference)), reference).toBe(true);
    }
  });

  it('pulls in no stylesheet or font from the network', () => {
    const stylesheets = filesUnder(out).filter((path) => path.endsWith('.css'));
    for (const path of stylesheets) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/@import|url\(\s*['"]?(?:https?:)?\/\//);
    }
  });
});
