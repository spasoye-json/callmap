/**
 * A guard over the whole core, not over one module: the seam modules read data an extractor
 * already emitted and nothing else. If a package ever needs a filesystem, it stops being core and
 * belongs behind the extractor contract or in the sidecar (ADR-0009).
 *
 * An extractor package is the other side of that contract, so the guard reads it the other way
 * round: it is the one that reads a repo and the one that names a language.
 *
 * The host is the third kind: the sidecar runs the extractors and the UI talks to the sidecar
 * (ADR-0006). It is held to its own rules, so the core list stays exact.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGES_DIR = join(import.meta.dirname, '..', 'packages');

/** The one package that exists to describe a fixture repo, so it may name languages. */
const TEST_SUPPORT = 'testing';

/** A package that reads a repo and emits a document. It is not core; it is what core reads. */
const isExtractor = (name: string): boolean => name.startsWith('extractor-');

/**
 * The packages that run the app: the sidecar that reads a repo and runs extractors, and the UI
 * that talks to it (ADR-0006). They are neither core nor an extractor, and the list is exact, so a
 * new package cannot escape the core guard by calling itself host.
 */
const HOST_PACKAGES: readonly string[] = ['app', 'sidecar'];

const isHost = (name: string): boolean => HOST_PACKAGES.includes(name);

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

const corePackages = packageNames.filter((name) => !isExtractor(name) && !isHost(name));
const extractorPackages = packageNames.filter(isExtractor);
const hostPackages = packageNames.filter(isHost);

const importsIn = (name: string): ReadonlySet<string> =>
  new Set(
    sourceFilesOf(join(PACKAGES_DIR, name, 'src')).flatMap((path) =>
      importsOf(readFileSync(path, 'utf8')),
    ),
  );

describe('the ported core', () => {
  it('holds every seam module the skeleton needs', () => {
    expect(corePackages).toEqual([
      'canvas-model',
      'flow-document',
      'flow-library',
      'layout',
      'reference-graph',
      'staleness',
      TEST_SUPPORT,
    ]);
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

  it.each(corePackages.filter((name) => name !== TEST_SUPPORT))(
    '%s names no language, because the core is language-blind',
    (name) => {
      const offenders = sourceFilesOf(join(PACKAGES_DIR, name, 'src')).filter((path) =>
        /'(typescript|javascript|go|ruby)'/.test(readFileSync(path, 'utf8')),
      );
      expect(offenders).toEqual([]);
    },
  );
});

describe('the extractors it ships', () => {
  it('holds one package per language version one supports, so far', () => {
    expect(extractorPackages).toEqual(['extractor-ruby', 'extractor-typescript']);
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

/** A module specifier that names a Node built-in, whether or not it carries the `node:` prefix. */
const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') || builtinModules.includes(specifier.split('/')[0] ?? '');

describe('the host that runs it', () => {
  it('holds the sidecar and the UI, and nothing else', () => {
    expect(hostPackages).toEqual(HOST_PACKAGES);
  });

  it('runs every extractor from the sidecar, as a process of its own', () => {
    expect(importsIn('sidecar')).toContain('node:child_process');
  });

  it('keeps the UI off the filesystem and away from every extractor', () => {
    const offenders = [...importsIn('app')].filter(
      (specifier) => isNodeBuiltin(specifier) || specifier.startsWith('@archmap/extractor-'),
    );
    expect(offenders).toEqual([]);
  });

  it('lets the UI name the sidecar command surface by type only', () => {
    const offenders = sourceFilesOf(join(PACKAGES_DIR, 'app', 'src')).filter((path) => {
      const text = readFileSync(path, 'utf8');
      const named = text.match(/['"]@archmap\/sidecar['"]/g)?.length ?? 0;
      const byType =
        text.match(/import type\s*\{[^}]*\}\s*from\s*['"]@archmap\/sidecar['"]/g)?.length ?? 0;
      return named !== byType;
    });
    expect(offenders).toEqual([]);
  });
});
