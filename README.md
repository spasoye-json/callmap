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
callmap review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains]
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
| `--no-cache`        | Reads the base again and does not write the cache.                                               | The base comes from the cache if it is there     |
| `--editor <name>`   | The editor that the editor link on each function opens: `vscode` or `jetbrains`.                 | `vscode`                                         |

The default branch is the head of `origin`, then the head of any other remote, then `main`, then `master`. The review reads the base commit in a temporary git worktree and removes it at the end, so the checkout and the uncommitted files never move. The worktree links to the `node_modules` folders of the checkout, so the library types resolve on the base too. The command prints the path of the page when it ends.

The command caches the graph of the base, so a second review of the same base reads only the branch. The cache is in `$XDG_CACHE_HOME/callmap/`, or in `~/.cache/callmap/` when the variable is not set. A cache entry belongs to one base commit, one set of scope globs, one tsconfig, one lock file in the checkout and one version of the extractor. A change of any of them reads the base again. The cache never holds the graph of the branch. It keeps the 20 newest entries for each repo. A cache file that cannot be read gives a fresh read of the base. You can delete the folder at any time.

A scope glob matches a whole path from the repo root. `*` matches inside one folder, `**` matches across folders, and `?` matches one character. A glob that starts with `!` leaves files out. Quote each glob, so that the shell does not expand it.

A backend in a subfolder of a monorepo, with its tests left out:

```sh
callmap review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.spec.ts'
```

Tests stay in the review unless a glob leaves them out. A test that mocks its calls adds open ends, so it lowers the resolution rate.

## The reader page

The page is one HTML file with no network access, so it opens from a file anywhere. ELK lays out the graph, and the page draws it as SVG. The command lays out the Diff view and the top level of the Whole project view, so they open with no wait. The page lays out the other views and the other levels when you open them. The page stores the file texts as one gzip block, and the browser unpacks it with `DecompressionStream` after the first view draws. Each call is a line that turns only at 90 degrees and never goes through a box. The callers stand on the left and the callees on the right. Drag the graph to pan it, and use the mouse wheel to zoom.

A click on a function selects it. The graph highlights its calls in and out and the functions at their other ends, and it fades the rest. The pointer over any box, also a box that opens a level, shows the same highlight for that box until the pointer leaves it, but it does not open the code panel or the level. A click on the empty graph or the Escape key clears the selection. The click also opens the code panel. The panel shows the code of the function in a read-only editor, with syntax highlighting and the line numbers of the file. For a changed function, it shows a unified diff as Git does: each removed line in red above the added lines in green, and the exact changed characters in bold. An added function is all green, and a removed function is all red. The code panel is on the right of the graph. The left panel holds the search, the resolution rate, the legend of the marks, and the lists of a view. Each panel collapses and opens with its own button, and a drag on its inner edge changes its width. The graph keeps the selected function in view when a panel opens or closes. The search finds any function in scope by name. Each function carries an editor link that opens its file at its first line.

### The views

The tabs above the graph choose the view. Each view keeps the marks for added, removed, changed and neighbour. Only a function one hop from a changed function gets the neighbour mark. Other functions get no mark.

- **Diff:** the changed functions and one hop around each, inside file frames. This view opens first. A click on a function that the branch did not change opens its own callers and callees. In the other views, a click on a function only shows its code.
- **Whole project:** one level of the folder tree at a time, with a line between 2 boxes for the calls between them. The next part tells how the levels work.
- **Folder:** a folder tree beside the graph. A click on a folder draws its functions, the calls between them, and the functions one hop outside the folder. The view draws these outside functions greyed, and it draws only the calls that touch a function of the folder.
- **Route:** a list of entry points beside the graph. An entry point is a function in scope that no other function in scope calls. The entry points that reach a changed function come first. A click on an entry point draws its whole call tree. Each function shows once, so a cycle ends. A search opens the first entry point in the list that reaches the function. If no entry point reaches it, the view draws the call tree of the function itself.

The page shows the resolution rate of the whole branch graph in scope: the calls into the repo's own code that the type checker proved, out of all of them. Below the rate it lists the open ends of the functions in this review only. It marks each open end at its call site, as a dashed arrow that leads nowhere, also on a function that a next hop or a search adds. It draws the one-of calls of one call site, such as a call through an interface, as dotted arrows, one to each implementation. A call into a library is not in the graph and does not change the rate.

### The levels of the Whole project view

```
top level                          after a click on src/orders
┌──────────┐  12  ┌──────────┐     ┌─ src/orders ─────────────────┐
│src/orders│─────▶│src/money │     │ ┌────────┐  4  ┌──────────┐ │  9  ┌─────────┐
└──────────┘      └──────────┘     │ │ api/   │───▶│ service/ │─┼───▶│src/money│
     │ 3              ▲ 7          │ └────────┘    └──────────┘ │     └─────────┘
     ▼                │            └──────────────────────────────┘
┌──────────┐──────────┘
│src/notify│
└──────────┘
```

A level is one folder of the scope or one file. The view opens at the top level: the deepest folder that holds every file in scope. Each child folder and each file of a folder level is a box. A chain of folders with one child each shows as one box, such as `src/orders/api`. A folder with only one file shows as the box of that file, such as `src/tax/rate.ts`. So a level never holds a single box.

A line between 2 boxes stands for every call from the code in one box to the code in the other box, with their count. It points from the caller box to the callee box, so 2 boxes that call each other get 2 lines. A call inside one box makes no line at that level. The lines come only from the calls that the type checker proved, so an import of a type or a constant makes no line. A click on a line lists its calls with their marks, and a click on a call shows the code of the caller.

A box counts the changed, added and removed functions inside it, and the open ends of its functions, for example "3 changed, 1 added". It shows the change mark when it holds a changed, an added or a removed function. A line shows the added or removed mark when it holds an added or a removed call.

A click on a folder box opens the level of that folder, inside its folder frame. A call between the open folder and code outside it ends at an outside box. The outside box is the first folder on the path of that code that does not hold the open folder. With `src/orders` open, a call to `src/money/format.ts` ends at the box `src/money`, and a call to `lib/a.ts` ends at `lib`. An outside box collapses by the same rules as the boxes of a level, so a call to `src/shipping/carriers/post.ts` ends at `src/shipping/carriers` when `src/shipping` holds only `carriers`. A click on an outside box opens the level of that outside code.

A click on a file box opens the file level. It shows the functions of the file in a file frame, and each call between them has its own line, as in the Diff view. A caller or a callee in another file ends at an outside box, by the same rule. The calls between one function and one outside box share one line with their count. The open ends, the one-of groups, the selection and the code panel work on the file level as in the other views. The breadcrumb at the top of the graph names each level from the top level down to the open one. A click on a name opens that level again. The search opens the file level of the function that it finds and selects its box.

The command lays out the top level. The page lays out each other level the first time that you open it, and keeps that layout. The layout time of a level depends on its boxes and lines, not on the size of the repo. Each layout in the page records a `performance.measure` with the name `callmap layout:`, the view and the level, so the profiler of the browser shows it. ADR-0017 records the numbers on a large repo.

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

The page script lives in `packages/cli/page/`. The CLI bundles it with `elkjs` into the page at each run. The command lays out the Diff view and the top level of the Whole project view in worker threads with the same layout module, `page/layout.ts`, and writes the places into the page data. `page/levels.ts` builds the boxes and the lines of each level. The page lays out the other views in the browser, and draws every view as SVG. A view is one module in `packages/cli/page/views/`: a pure function from the page data to frames, boxes and lines. A new part of the page is one module in `packages/cli/page/parts/` that default-exports a `PagePart`. The CLI loads each part in name order, with no change to another file.

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
