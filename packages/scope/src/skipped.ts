/**
 * The directories no walk of a repo enters, whoever walks it: the host when it detects the
 * languages of a repo, and every extractor when it reads one. One list, so detection and
 * extraction cannot disagree about a file.
 *
 * `node_modules` and `vendor` hold other people's code, and a dot directory holds a tool's
 * bookkeeping, the map file among them. The Go extractor is a Go program with its own copy of this
 * list, plus the `testdata` directories the go tool never builds.
 */

const SKIPPED_NAMES: readonly string[] = ['node_modules', 'vendor'];

export const isSkippedDirectory = (name: string): boolean =>
  SKIPPED_NAMES.includes(name) || name.startsWith('.');
