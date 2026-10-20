import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { inScope } from '@callmap/scope';
import { extractGo, removeGoExtractorBinary } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

afterAll(removeGoExtractorBinary);

/**
 * Every extractor reads a scope glob the same way, or one scope would take different files
 * depending on the language that reads it. The Go program holds its own copy of the glob rule, so
 * it is held to the shared reader in `@callmap/scope` over the cases that reader is tested on.
 */
const PATHS = [
  'checkout.go',
  'tools/build.go',
  'src/a.go',
  'src/ab.go',
  'src/a_go.go',
  'src/checkout.go',
  'src/checkout_test.go',
  'src/screens/checkout.go',
  'src/a/b/checkout_test.go',
];

const GLOBS: readonly (readonly string[])[] = [
  [],
  ['src/**'],
  ['src/**', 'tools/**'],
  ['src/*.go'],
  ['**/*.go'],
  ['src/**/*_test.go'],
  ['src/?.go'],
  ['src/checkout'],
  ['src/a.go.go'],
  ['src?a.go'],
  ['src/**', '!**/*_test.go'],
  ['!src/**'],
];

const repo = tempDir('callmap-go-scope-');
for (const path of PATHS) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), 'package scope\n');
}

describe('the scope globs of the Go extractor', () => {
  it.each(GLOBS.map((scope) => [JSON.stringify(scope), scope] as const))(
    'takes the same files as every other extractor under %s',
    (_, scope) => {
      const goFiles = PATHS.filter((path) => path.endsWith('.go'));
      const expected = goFiles.filter((path) => inScope(path, scope)).sort();
      expect(extractGo({ repo, scope }).files).toEqual(expected);
    },
  );
});
