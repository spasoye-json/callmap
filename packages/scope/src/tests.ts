/**
 * The test files that no walk reads unless the user asks for them with `--tests` (ADR-0029). The
 * globs name the file-name rules of each language, and the folders that hold tests by convention.
 * The Go extractor is a Go program with its own copy of this list, `testGlobs` in
 * packages/extractor-go/go/scope.go. A test fails when the 2 copies differ.
 */

export const TEST_GLOBS: readonly string[] = [
  '**/*_test.go',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_spec.rb',
  '**/*_test.rb',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
  '**/spec/**',
];

/**
 * The scope that a walk reads: the globs of the user, then each test glob as a `!` glob, unless the
 * user asks for the tests. A negated glob that the user already typed does not repeat.
 */
export const effectiveScope = (scope: readonly string[], tests: boolean): readonly string[] =>
  tests
    ? scope
    : [...scope, ...TEST_GLOBS.map((glob) => `!${glob}`).filter((glob) => !scope.includes(glob))];
