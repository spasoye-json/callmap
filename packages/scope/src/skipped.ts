/**
 * The directories that no extractor enters when it walks a repo. One list, so two extractors
 * cannot disagree about a file.
 *
 * `node_modules` and `vendor` hold other people's code, and a dot directory holds a tool's
 * bookkeeping. The Go extractor is a Go program with its own copy of this
 * list, plus the `testdata` directories the go tool never builds.
 */

const SKIPPED_NAMES: readonly string[] = ['node_modules', 'vendor'];

export const isSkippedDirectory = (name: string): boolean =>
  SKIPPED_NAMES.includes(name) || name.startsWith('.');
