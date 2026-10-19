# Callmap

Callmap is a call graph reader for an engineer who still reads code. It reads a branch of a TypeScript repo with the TypeScript type checker, with no AI, and writes one HTML page for the code review. The page shows each function that the branch added, removed or changed, inside the frame of its file. Around each one it shows its callers and its callees, and it marks each call that the branch added or removed. Tabs show the same graph as the whole project, as one folder, or as one route. The same commits always give the same page and the same layout.

## Install

Callmap needs Node 22.18 or later. Install the `callmap` command from a clone of this repo:

```sh
npm install
npm link -w @callmap/cli
```

The link points at the clone, so a `git pull` updates the command. `npm unlink -g @callmap/cli` removes it.

## Review a branch

Check out the branch, then run the review in its repo:

```sh
callmap review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--editor vscode|jetbrains]
```

| Argument            | What it does                                                                                     | Default                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `<repo>`            | The repo to review. Any folder inside it works.                                                  | The current folder                               |
| `--base <commit>`   | The commit to compare the branch with.                                                           | The merge base with the default branch           |
| `--scope <glob>`    | Limits the review to the files that the glob matches. Give it once for each glob.                | Every file of the repo                           |
| `--scope '!<glob>'` | Leaves out the files that the glob matches, also when another glob takes them.                   | Nothing left out                                 |
| `--tsconfig <file>` | The TypeScript config to read, as an absolute path or a path relative to the repo root.          | `tsconfig.json` at the repo root, if it exists   |
| `--out <file>`      | Where the page is written.                                                                       | `review-<repo folder>.html` in `$TMPDIR/callmap` |
| `--no-open`         | Writes the page and does not open it, for example to attach it to a merge request.               | The page opens in the browser                    |
| `--editor <name>`   | The editor that the editor link on each function opens: `vscode` or `jetbrains`.                 | `vscode`                                         |

The default branch is the head of `origin`, then the head of any other remote, then `main`, then `master`. The review reads the base commit in a temporary git worktree and removes it at the end, so the checkout and the uncommitted files never move. The worktree links to the `node_modules` folders of the checkout, so the library types resolve on the base too. The command prints the path of the page when it ends.

A scope glob matches a whole path from the repo root. `*` matches inside one folder, `**` matches across folders, and `?` matches one character. A glob that starts with `!` leaves files out. Quote each glob, so that the shell does not expand it.

A backend in a subfolder of a monorepo, with its tests left out:

```sh
callmap review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.spec.ts'
```

Tests stay in the review unless a glob leaves them out. A test that mocks its calls adds open ends, so it lowers the resolution rate.

## The reader page

The page is one HTML file with no network access, so it opens from a file anywhere. ELK lays out the graph in the browser, and the page draws it as SVG. Each call is a line that turns only at 90 degrees and never goes through a box. The callers stand on the left and the callees on the right. Drag the graph to pan it, and use the mouse wheel to zoom.

A click on a function selects it. The graph highlights its calls in and out and the functions at their other ends, and it fades the rest. A click on the empty graph or the Escape key clears the selection. The click also opens the code panel. The panel shows the code of the function in a read-only editor, with syntax highlighting and the line numbers of the file. For a changed function, it shows a unified diff as Git does: each removed line in red above the added lines in green, and the exact changed characters in bold. An added function is all green, and a removed function is all red. The code panel is on the right of the graph. The left panel holds the search, the resolution rate, the legend of the marks, and the lists of a view. Each panel collapses and opens with its own button, and a drag on its inner edge changes its width. The graph keeps the selected function in view when a panel opens or closes. The search finds any function in scope by name. Each function carries an editor link that opens its file at its first line.

### The views

The tabs above the graph choose the view. Each view keeps the marks for added, removed, changed and neighbour. Only a function one hop from a changed function gets the neighbour mark. Other functions get no mark.

- **Diff:** the changed functions and one hop around each, inside file frames. This view opens first. A click on a function that the branch did not change opens its own callers and callees. In the other views, a click on a function only shows its code.
- **Whole project:** every function in scope, inside its file frame, inside the frame of each folder above it. The kept calls between two files become one bundled line with their count. A click on a bundled line lists its calls, and a click on a call shows the code of the caller. When you zoom out, the view shows only the folders, the files and the bundled lines.
- **Folder:** a folder tree beside the graph. A click on a folder draws its functions, the calls between them, and the functions one hop outside the folder. The view draws these outside functions greyed, and it draws only the calls that touch a function of the folder.
- **Route:** a list of entry points beside the graph. An entry point is a function in scope that no other function in scope calls. The entry points that reach a changed function come first. A click on an entry point draws its whole call tree. Each function shows once, so a cycle ends. A search opens the first entry point in the list that reaches the function. If no entry point reaches it, the view draws the call tree of the function itself.

The page shows the resolution rate of the whole branch graph in scope: the calls into the repo's own code that the type checker proved, out of all of them. Below the rate it lists the open ends of the functions in this review only. It marks each open end at its call site, as a dashed arrow that leads nowhere, also on a function that a next hop or a search adds. It draws the one-of calls of one call site, such as a call through an interface, as dotted arrows, one to each implementation. A call into a library is not in the graph and does not change the rate.

## Ask Claude for a review

`skills/callmap-review` is a Claude Code skill that runs `callmap review` and opens the page. Install it for your user from the root of this repo:

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/callmap-review" ~/.claude/skills/callmap-review
```

Then ask Claude for a Callmap review of the branch. The skill needs the `callmap` command from the install step.

## Records

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions. ADR-0012 tells how the product became a call graph reader. ADR-0014 tells why it is named callmap.
- `docs/research/` holds the measurements and the research behind the decisions.

## Packages

The core packages read data and never read source code or a filesystem. See ADR-0009.

| Package                    | What it owns                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@callmap/graph-document`  | The graph document an extractor emits: files, functions, calls with their one-of groups, open ends, a language and a scope                               |
| `@callmap/review`          | The review of a branch: the changed functions, their neighbours, the added and removed calls, their open ends and one-of groups, and the resolution rate |
| `@callmap/reference-graph` | The document the Go and Ruby extractors emit: files, references, a language tag and a scope                                                              |
| `@callmap/scope`           | The scope globs and the skipped directories that every walk of a repo shares                                                                             |
| `@callmap/editor-link`     | The editor link that opens a file at a line                                                                                                              |

The extractors are the other side of the contract. Each one reads a repo and names its language.

| Package                         | What it owns                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `@callmap/extractor-typescript` | TypeScript and JavaScript, with functions and calls resolved by the TypeScript type checker |
| `@callmap/extractor-go`         | Go, read by a Go program that uses only the Go standard library                             |
| `@callmap/extractor-ruby`       | Ruby, with constants resolved by Zeitwerk conventions, one loader per Rails app             |

The host runs the extractors and the core, and writes the reader page.

| Package        | What it owns                                                                              |
| -------------- | ----------------------------------------------------------------------------------------- |
| `@callmap/cli` | The `callmap` command: git, the extractor processes, and the reader page with ELK inlined |

The page script lives in `packages/cli/page/`. The CLI bundles it with `elkjs` into the page at each run. ELK lays out the graph in the browser, and the page draws it as SVG. A view is one module in `packages/cli/page/views/`: a pure function from the page data to frames, boxes and lines. A new part of the page is one module in `packages/cli/page/parts/` that default-exports a `PagePart`. The CLI loads each part in name order, with no change to another file.

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
