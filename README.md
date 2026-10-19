# Archmap

Archmap is a call graph reader for an engineer who still reads code. It reads a branch of a TypeScript repo with the TypeScript type checker, with no AI, and writes one HTML page for the code review. The page shows each function that the branch added, removed or changed, inside the frame of its file. Around each one it shows its callers and its callees, and it marks each call that the branch added or removed. The same commits always give the same page.

## Install

Archmap needs Node 22.18 or later. Install the `archmap` command from a clone of this repo:

```sh
npm install
npm link -w @archmap/cli
```

The link points at the clone, so a `git pull` updates the command. `npm unlink -g @archmap/cli` removes it.

## Review a branch

Check out the branch, then run the review in its repo:

```sh
archmap review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--editor vscode|jetbrains]
```

| Argument            | What it does                                                                                     | Default                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `<repo>`            | The repo to review. Any folder inside it works.                                                  | The current folder                               |
| `--base <commit>`   | The commit to compare the branch with.                                                           | The merge base with the default branch           |
| `--scope <glob>`    | Limits the review to the files that the glob matches. Give it once for each glob.                | Every file of the repo                           |
| `--scope '!<glob>'` | Leaves out the files that the glob matches, also when another glob takes them.                   | Nothing left out                                 |
| `--tsconfig <file>` | The TypeScript config to read, as an absolute path or a path relative to the repo root.          | `tsconfig.json` at the repo root, if it exists   |
| `--out <file>`      | Where the page is written.                                                                       | `review-<repo folder>.html` in `$TMPDIR/archmap` |
| `--no-open`         | Writes the page and does not open it, for example to attach it to a merge request.               | The page opens in the browser                    |
| `--editor <name>`   | The editor that the editor link on each function opens: `vscode` or `jetbrains`.                 | `vscode`                                         |

The default branch is the head of `origin`, then the head of any other remote, then `main`, then `master`. The review reads the base commit in a temporary git worktree and removes it at the end, so the checkout and the uncommitted files never move. The worktree links to the `node_modules` folders of the checkout, so the library types resolve on the base too. The command prints the path of the page when it ends.

A scope glob matches a whole path from the repo root. `*` matches inside one folder, `**` matches across folders, and `?` matches one character. A glob that starts with `!` leaves files out. Quote each glob, so that the shell does not expand it.

A backend in a subfolder of a monorepo, with its tests left out:

```sh
archmap review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.spec.ts'
```

Tests stay in the review unless a glob leaves them out. A test that mocks its calls adds open ends, so it lowers the resolution rate.

## The reader page

The page is one HTML file with no network access, so it opens from a file anywhere. A click on a function shows its code, with the changed lines marked and a mark below each deletion. A click on a greyed neighbour opens its own callers and callees. The search finds any function in scope by name. Each function carries an editor link that opens its file at its first line.

The page shows the resolution rate of the whole branch graph in scope: the calls into the repo's own code that the type checker proved, out of all of them. Below the rate it lists the open ends of the functions in this review only. It marks each open end at its call site, as a dashed arrow that leads nowhere, also on a function that a next hop or a search adds. It draws the one-of calls of one call site, such as a call through an interface, as dotted arrows, one to each implementation. A call into a library is not in the graph and does not change the rate.

## Ask Claude for a review

`skills/archmap-review` is a Claude Code skill that runs `archmap review` and opens the page. Install it for your user from the root of this repo:

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/archmap-review" ~/.claude/skills/archmap-review
```

Then ask Claude for an Archmap review of the branch. The skill needs the `archmap` command from the install step.

## Records

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions. ADR-0012 tells how Archmap became a call graph reader.
- `docs/research/` holds the measurements and the research behind the decisions.

## Packages

The core packages read data and never read source code or a filesystem. See ADR-0009.

| Package                    | What it owns                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@archmap/graph-document`  | The graph document an extractor emits: files, functions, calls with their one-of groups, open ends, a language and a scope                               |
| `@archmap/review`          | The review of a branch: the changed functions, their neighbours, the added and removed calls, their open ends and one-of groups, and the resolution rate |
| `@archmap/reference-graph` | The document the Go and Ruby extractors emit: files, references, a language tag and a scope                                                              |
| `@archmap/scope`           | The scope globs and the skipped directories that every walk of a repo shares                                                                             |
| `@archmap/editor-link`     | The editor link that opens a file at a line                                                                                                              |

The extractors are the other side of the contract. Each one reads a repo and names its language.

| Package                         | What it owns                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `@archmap/extractor-typescript` | TypeScript and JavaScript, with functions and calls resolved by the TypeScript type checker |
| `@archmap/extractor-go`         | Go, read by a Go program that uses only the Go standard library                             |
| `@archmap/extractor-ruby`       | Ruby, with constants resolved by Zeitwerk conventions, one loader per Rails app             |

The host runs the extractors and the core, and writes the reader page.

| Package        | What it owns                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `@archmap/cli` | The `archmap` command: git, the extractor processes, and the reader page with Cytoscape inlined |

The page script lives in `packages/cli/page/`. The CLI bundles it with Cytoscape into the page at each run. A new part of the page is one module in `packages/cli/page/parts/` that default-exports a `PagePart`. The CLI loads each part in name order, with no change to another file.

`test/core-is-language-blind-and-pure.test.ts` reads the imports of every package. It holds the core away from the filesystem and from any language name. It holds each extractor to the opposite. It holds the host to its own list, and keeps the page script off every Node built-in.

Each extractor runs as its own process and writes its document to its standard output:

```sh
node packages/extractor-typescript/src/cli.ts <repo> --scope 'src/**'
node packages/extractor-ruby/src/cli.ts <repo> --scope 'apps/**'
go -C packages/extractor-go/go run . <absolute-repo> --scope 'internal/**'
```

The Ruby extractor needs `ruby` on the `PATH`. It parses with Ripper, which every Ruby ships, so it needs no gem. The Go extractor needs `go` on the `PATH`. It never runs the go tool against the target repo, so it needs no network.

Each extractor commits a small fixture repo under `packages/<extractor>/fixture/`, because an extractor must be tested against files on disk.

## Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
```
