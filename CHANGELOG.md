# Changelog

Each version of Callmap gets a section here. The changes that no version holds yet are under Unreleased.

## Unreleased

## 0.1.1

- The `bin` field of the package names `dist/cli.js` with no `./`, so `npm publish` changes no field of the manifest.

## 0.1.0

The first version on npm.

- The command installs from npm as `@callmap/cli`, and `npx @callmap/cli review` runs it with no clone.
- `callmap review` reads a branch of a TypeScript repo with the TypeScript type checker and writes one HTML reader page for the code review. The same commits always give the same page and the same layout.
- The review also reads Go with `go/types` when `go` 1.26 or later is on the `PATH`. The package carries the source of the Go extractor, and the first review with a Go file builds it.
- `callmap review` and each extractor CLI read no test file by default, in every language. `--tests` reads them. ADR-0029 names the test globs.
- The review compares the branch with the merge base of the default branch, or with the commit of `--base`. It reads the base in a temporary git worktree, so the checkout and the uncommitted files never move.
- `--scope` limits the review to the files that a glob matches, and a glob that starts with `!` leaves files out. `--tsconfig` names the TypeScript config to read.
- `--out` names the file of the page, and `--no-open` writes the page without opening it.
- The command caches the graph of the base in `$XDG_CACHE_HOME/callmap/`, so a second review of the same base reads only the branch. `--no-cache` reads the base again.
- The reader page is one HTML file with no network access. It follows the light mode or the dark mode of the system.
- The Diff view shows each changed function inside its file frame, with its callers and its callees one hop around it. Each function carries a mark for added, removed, changed or neighbour, and the page marks each call that the branch added or removed.
- The Whole project view shows one level of the folder tree at a time. The Folder view shows one folder, and the Route view shows the call tree of one entry point.
- A click on a function selects it and opens the code panel. The panel shows the code in a read-only editor with a unified diff, and lists the callers and the callees.
- The page shows the resolution rate and lists the open ends by file. It draws each open end and each one-of call at its call site.
- The legend counts each mark, and a click on a mark hides the functions with that mark.
- The search finds any function in scope by name. Each function has an editor link for VS Code or JetBrains, which `--editor` chooses.
- The zoom controls, the overview map, the edge hints and the keys move around a large level. A level that fits at the reading floor or above opens whole, and a larger level opens at 100%.
