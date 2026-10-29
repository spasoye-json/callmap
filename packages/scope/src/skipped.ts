/**
 * The directories that no extractor enters when it walks a repo. One list, so the TypeScript and
 * Ruby extractors cannot disagree about a file.
 *
 * `node_modules` and `vendor` hold other people's code, and a dot directory holds a tool's
 * bookkeeping. The Go extractor is a Go program with its own copy of this list. Its copy also holds
 * `testdata` and the directories whose name starts with `_`. The pattern `./...` of the go tool
 * skips them. `goSkipsDirectory` in packages/cli/src/extractors.ts copies the list of the Go
 * extractor.
 */

const SKIPPED_NAMES: readonly string[] = ['node_modules', 'vendor'];

export const isSkippedDirectory = (name: string): boolean =>
  SKIPPED_NAMES.includes(name) || name.startsWith('.');
