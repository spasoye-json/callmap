/**
 * A guard over the whole core, not over one module: the core packages read data an extractor
 * already emitted and nothing else. If a package ever needs a filesystem, it stops being core and
 * belongs behind the extractor contract (ADR-0009).
 *
 * An extractor package is the other side of that contract, so the guard reads it the other way
 * round: it is the one that reads a repo and the one that names a language.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGES_DIR = join(import.meta.dirname, '..', 'packages');

/** A package that reads a repo and emits a document. It is not core; it is what core reads. */
const isExtractor = (name: string): boolean => name.startsWith('extractor-');

const FORBIDDEN_IMPORTS = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'child_process',
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'typescript',
]);

const sourceFilesOf = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesOf(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });

/**
 * Every module specifier a file names, however it names it: a static import, a re-export, or a
 * dynamic `import(...)`, quoted either way. A guard that only reads one spelling reads as stronger
 * than it is.
 */
const importsOf = (text: string): readonly string[] =>
  [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
    ([, specifier]) => specifier ?? '',
  );

const packageNames = readdirSync(PACKAGES_DIR)
  .filter((entry) => statSync(join(PACKAGES_DIR, entry)).isDirectory())
  .sort();

const corePackages = packageNames.filter((name) => !isExtractor(name));
const extractorPackages = packageNames.filter(isExtractor);

const importsIn = (name: string): ReadonlySet<string> =>
  new Set(
    sourceFilesOf(join(PACKAGES_DIR, name, 'src')).flatMap((path) =>
      importsOf(readFileSync(path, 'utf8')),
    ),
  );

describe('the core', () => {
  it('holds every core package the reader keeps', () => {
    expect(corePackages).toEqual(['editor-link', 'graph-document', 'reference-graph', 'scope']);
  });

  it('reads a specifier however it is spelled, so the guard cannot be side-stepped', () => {
    const spellings = [
      "import { readFileSync } from 'node:fs';",
      'import { readFileSync } from "node:fs";',
      "export { readFileSync } from 'node:fs';",
      "const fs = await import('node:fs');",
      'const fs = await import("node:fs");',
    ];
    for (const spelling of spellings) {
      expect(importsOf(spelling), spelling).toContain('node:fs');
    }
  });

  it.each(corePackages)('%s reads no source code and no filesystem', (name) => {
    const sources = sourceFilesOf(join(PACKAGES_DIR, name, 'src'));
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.flatMap((path) =>
      importsOf(readFileSync(path, 'utf8'))
        .filter((specifier) => FORBIDDEN_IMPORTS.has(specifier))
        .map((specifier) => `${path} imports ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it.each(corePackages)('%s names no language, because the core is language-blind', (name) => {
    const offenders = sourceFilesOf(join(PACKAGES_DIR, name, 'src')).filter((path) =>
      /'(typescript|javascript|go|ruby)'/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the extractors it ships', () => {
  it('holds one package per language that Archmap reads, so far', () => {
    expect(extractorPackages).toEqual(['extractor-go', 'extractor-ruby', 'extractor-typescript']);
  });

  it.each(extractorPackages)('%s is the side of the contract that reads a repo', (name) => {
    expect(importsIn(name)).toContain('node:fs');
  });

  it.each(extractorPackages)(
    '%s names the language it claims, so the core never has to',
    (name) => {
      const sources = sourceFilesOf(join(PACKAGES_DIR, name, 'src'));
      const naming = sources.filter((path) =>
        /'(typescript|javascript|go|ruby)'/.test(readFileSync(path, 'utf8')),
      );
      expect(naming.length).toBeGreaterThan(0);
    },
  );
});
