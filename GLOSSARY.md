# Callmap

Callmap is a code reader for an engineer who still reads code. It builds the call graph of a repo with static rules that prove each call, with no AI, and writes it as one HTML page, so a reviewer can see where each change sits and how the changed files talk to each other. `docs/adr/` holds the architectural decisions and `docs/product.md` holds the product record.

## Language

A word an entry lists under _Avoid_ can still stand in a settled record. ADR-0001 to ADR-0011 say _flow_, _trace_, _map_ and _reference graph_, because those words named the plan when it was decided. A decision record is not rewritten to match a later decision.

### The graph

**Function**:
One named piece of code that can be called: a function, a method, or a constructor. It is anchored to a file and a line.
_Avoid_: node, symbol, routine

**Call**:
An arrow from one function to a function it calls, proven by static rules: the type checker of the language, or Callmap's own rules for Ruby. The page draws a call with the colour token `--edge`. The Tokens artboard of the design gives that name, so the page keeps it. It is the only place where the page says "edge" for a call.
_Avoid_: edge, link, dependency

**Call graph**:
Every function in scope, every call between them, and every open end.
_Avoid_: map, dependency graph, reference graph

**Open end**:
A call that the language's tools cannot tie to a function, such as a call on an untyped value or a callback. The page shows it, marked, with its open-end reason, and it leads nowhere.
_Avoid_: unknown call, gap, hole

**Open-end reason**:
The cause, from a fixed list, of why the language's tools cannot tie an open end to a function: code not found, a dynamic key, an untyped value, a function value, no implementation in scope, or not resolved for any other cause. When 2 causes fit, the first in this list names the open end. So a dynamic key on a map of functions is a dynamic key, not a function value.
_Avoid_: cause, error, why

**Library call**:
A call whose callee is code outside the repo, such as the standard library, a module, a gem or a framework. In Ruby, a call that the class chain passes to a framework class, and a call to a method that a framework macro makes, such as `has_many`, are library calls too. In Go, a call through an interface of the repo that only library types implement is a library call too. The call graph does not hold a library call, and the resolution rate does not count it.
_Avoid_: external call, vendor call, leaf

**One-of call**:
One of several calls from one call site through an interface or a map of strategies, one to each implementation. In Ruby, a call on `self` in a module and a call to an abstract method give one-of calls too. Only one of them runs.
_Avoid_: maybe call, possible call

**One-of group**:
The one-of calls of one call site. The page draws them as alternatives, and the resolution rate counts the group as one call.
_Avoid_: call site group, alternative set

**Resolution rate**:
The share of calls into the repo's own code that the language's tools tie to one function: the calls, divided by the calls plus the open ends. A one-of group counts as one call. A call into a library and a call that no named function holds count in neither. It tells the reader how much of the graph the tools proved. A page with several languages shows one rate for each language, because one mixed rate hides the weak language.
_Avoid_: accuracy, confidence, coverage

**File frame**:
The box around the functions of one file.
_Avoid_: group, cluster, module

**Folder frame**:
The box around the file frames and the folder frames of one folder. On a level of the Whole project view, the folder frame holds the boxes of the open folder.
_Avoid_: package, directory box

**Bundled line**:
One line between 2 boxes of a level that stands for every call from the code in one box to the code in the other box, with their count. It points from the caller box to the callee box, so 2 boxes that call each other get 2 bundled lines. A call inside one box makes no line at that level. The line shows the added or the removed mark when it holds a call that the branch added or removed. A click on it lists its calls with their marks. On the file level, each call between 2 functions of the file keeps its own line, and only the calls between one function and one outside box share a bundled line.
_Avoid_: aggregate edge, merged call

**Entry point**:
A function in scope that no other function in scope calls, such as a route handler or a scheduled job. The core finds the entry points from the call graph, so the rule is the same for every language. The list shows first the entry points that reach a changed function.
_Avoid_: root, main, handler

**Route**:
The call tree of one entry point: the entry point and every function that it reaches through calls in scope. Each function shows once, so a cycle ends.
_Avoid_: path, trace, flow

### Reading

**Extractor**:
The per-language program that reads the source code and emits the graph document. The core never reads source code, only what an extractor emits.
_Avoid_: parser, analyzer, scanner

**Graph document**:
What one extractor emits for one repo: its files, its functions, its calls, its open ends, the scope it was built under, and the checker that proved its calls.
_Avoid_: graph JSON, payload, manifest

**Checker**:
The tool of a language that proves the calls of a graph document, with its name and its full version, such as TypeScript 6.0.3. It is the tool that the extractor runs, not the tool that the repo under review installs. Ruby has no type checker, so its checker names Callmap's own Ruby rules and the Ruby that runs them. The page shows it next to the resolution rate of its language, one checker for each language on the page.
_Avoid_: compiler, type checker version, toolchain

**Reference graph document**:
A retired term. It named what the extractors emitted before spec 15: the files in scope and the import edges between them. No extractor emits it now. Every extractor emits a graph document. A settled record, such as ADR-0011, still uses the term.
_Avoid_: reference graph document, for any document that an extractor emits today

**Scope**:
The globs an extractor is run under, which limit which files enter its document, so a monorepo is read one subtree at a time. A glob that starts with `!` leaves out the files that it matches. The effective scope is the scope of the user with the test globs as `!` globs, unless `--tests` asks for the tests.
_Avoid_: filter, include path, root

**Load unit**:
The Ruby code that loads together, so that its constants share one set of names: one Rails app, the folder of one `.gemspec`, or else the rest of the repo. A constant ties only to a class or a module of its own load unit. A class takes its methods from every body of that class in its load unit.
_Avoid_: app, package, project

**Test file**:
A file that a test glob of `@callmap/scope` matches. A test glob is a file-name rule, such as `*_test.go`, or a folder, such as `test/`. No walk reads a test file unless `--tests` asks for it.
_Avoid_: spec file, test code

**Reader page**:
The one self-contained HTML file that the CLI writes. It holds the whole call graph in scope as data, so the reader can open more of it with no server.
_Avoid_: report, dashboard, artifact

**Editor link**:
The link on a function that opens its file and line in the reader's editor. A removed function has no editor link, because its file and line are gone from the working tree.
_Avoid_: deep link, jump link

**View**:
One drawing of the reader page, chosen with a tab: Diff, Whole project, Folder or Route. A view is a pure function from the page data and the choice of the reader, such as the open level, to boxes, frames and lines. A view also gives the model order of the ELK layout. The Diff view opens first. The marks, the open ends, the one-of groups, the selection and the code panel work in every view.
_Avoid_: mode, screen, perspective

**Diff limit**:
The most lines that the Diff view draws in one drawing: 2,000. Each line of the Diff view is one call. Over the Diff limit, the Diff view shows one level at a time, and the level bar says why. At the limit or under it, the Diff view is one drawing again. A next hop or a search can take the Diff view over the limit or back under it.
_Avoid_: cap, threshold, max size

**Level**:
One folder of the scope, or one file, that the Whole project view shows at a time. The Diff view also shows levels over the Diff limit, and its levels hold only the changed functions and their neighbours. The level of a folder shows its child folders and its files as boxes. The level of a file shows its functions as boxes. The top level is the deepest folder that holds every file of the view. A chain of folders with one child each shows as one box. A folder with only one file shows as the box of that file. So a level never holds a single box. A box counts the changed, added and removed functions inside it. A click on a box opens its level, and the breadcrumb leads back up.
_Avoid_: zoom level, depth, layer

**Outside box**:
A box of a level that stands for code that the open level does not hold, at the far end of a bundled line. It is the first folder or file on the path of that code that does not hold the open level. With `src/orders` open, a call to `src/money/format.ts` ends at the outside box `src/money`. An outside box collapses like the box of that path at its parent level, so a call to `src/tax/rate.ts` ends at the box `src/tax/rate.ts` when `src/tax` holds only that file. A click on an outside box opens the level of that folder or file. An outside box is a folder or a file, and an outside function is a function.
_Avoid_: external box, neighbour box, ghost

**Outside function**:
A function that the Folder view draws but that the chosen folder does not hold: a caller or a callee one hop out of the folder, or a function that the search opened. The view draws it greyed. This is not a review mark, so an outside function is also a neighbour only when it is one hop from a changed function.
_Avoid_: neighbour, external function

**Reading floor**:
The zoom where the box names are 11 px on the screen: 92%. A box name is the smallest text that names a box, 12 px at 100%. A support text can be smaller than 11 px at the reading floor, such as the "N fn" count, the label of an open end and the glyph of a chip. A view or a level opens whole when it fits at the reading floor or above. A larger one opens at 100% on one part of it, so its text can be read. Below the reading floor, the zoom label says "Overview".
_Avoid_: minimum zoom, readable zoom

**Zoom band**:
One range of zoom that decides what text the graph draws. Map, below 60%, draws the boxes and the chips only. The chips of a box keep their screen size while they fit the box. Scan, from 60% to the reading floor, draws the names at 11 px on the screen. Read, from the reading floor up, draws all the text. The lines and the count badges keep their screen size in every band. A frame label keeps its screen size while it fits the header of its frame.
_Avoid_: zoom level, detail level, level of detail

**Selected path**:
The selected box, the lines into it and out of it, and the boxes at the far ends of those lines. The page draws it in blue as the strongest thing on the screen, and everything off it fades. A hover lights the same parts around the box under the pointer, but the hover does not change the selected path. The selected path reaches one hop only, so it is not a route. "Path" alone still does not name a route.
_Avoid_: highlight, focus path, selection route

**Chip**:
A small square with a glyph that carries a mark: Δ changed, + added, − removed, · neighbour and ? open end. A function box shows the chip of its mark. A level box shows one chip for each mark that it counts, with the count beside it.
_Avoid_: tag, pill, icon

**Count badge**:
The number of calls on a bundled line, in a rounded box on the line. It shows only for 2 calls or more, and it says "999+" above 999.
_Avoid_: call count label, edge label

**Level bar**:
The bar at the top of the graph on a level of the Whole project view or of the Diff view. It holds the breadcrumb, the "Up one level" button and the count of the boxes and the lines of the open level. On a level of the Diff view, it also says that the review is over the Diff limit.
_Avoid_: toolbar, header

**Overview map**:
The small drawing at the bottom right of the graph that shows every box of the level, when the level is larger than the graph. It shows the selected path in blue and the visible part as a rectangle. A click or a drag on it moves the visible part. The map toggle of the zoom controls collapses it and opens it again. It opens by default, and a reload opens it again. The camera keeps the selected box clear of the overview map and the zoom controls.
_Avoid_: minimap, map

**Zoom controls**:
The group of buttons at the bottom right of the graph: "Zoom out", the zoom label, "Zoom in", "Fit" and the map toggle. The zoom label shows the zoom in percent, or "Overview" below the reading floor. The map toggle shows only when the overview map can show. The zoom controls sit above the overview map, and they drop to the bottom when the overview map collapses.
_Avoid_: toolbar, zoom bar

**Corner**:
The bottom right part of the graph under the zoom controls and the overview map, as they show at that moment. It is the bounding box of the two. When the overview map collapses or does not show, the corner is the zoom controls only. The camera moves the anchor box and the selected box out of the corner, and the edge hints keep clear of it.
_Avoid_: corner controls, floating controls

**Edge hint**:
A button at one edge of the graph that counts the boxes past that edge, for example "2 more →". A click pans to the nearest of them. The hint moves along its edge to the place nearest the middle where it covers no box. "Edge" here is the edge of the graph, not a call.
_Avoid_: scroll hint, more indicator

### Review

**Review**:
The reader page for one branch: every changed function, one hop around each, and the calls the branch added or removed, against the base. The branch side is the working tree, so a review also holds the uncommitted changes. The top bar names the branch and the base and shows the commit range from the base to HEAD, with a mark when the review holds uncommitted changes. A detached HEAD shows as "detached HEAD" in place of the branch name.
_Avoid_: PR view, change summary

**Base**:
The commit that a review compares the branch against: the merge base with the default branch, or the commit that `--base` names. The top bar names the base as git names it, such as `origin/main`, or as the reader typed it, such as `HEAD~8`.
_Avoid_: target, parent, main

**Dependency file**:
A file of the checkout that decides which code from outside the repo a language loads. The cache keeps one entry of the base for each language. A change of a dependency file reads the base of its language again. The dependency files of TypeScript are the lock files of npm, Yarn, pnpm and Bun. The dependency files of Go are every `go.sum` and every `go.work.sum`, and the `go.work` at the repo root. Ruby has no dependency file, because its rules read only the source of the repo and load no gem.
_Avoid_: lock file, for a file of Go

**Changed function**:
A function that the branch added, removed, or changed in its body.
_Avoid_: touched function, dirty function

**Hop**:
One call away from a function, in either direction. A caller and a callee are each one hop away.
_Avoid_: step, depth

**Neighbour**:
A function one hop from a changed function that the branch did not change. Every view shows it greyed. In the Diff view, a click opens its own next hop. A function further from the change gets no mark. The hop counts in the base graph and in the branch graph, so the far end of a call that the branch removed is a neighbour too, and the page shows that call.
_Avoid_: context function, related function
