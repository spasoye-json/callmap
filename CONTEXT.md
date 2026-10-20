# Callmap

Callmap is a code reader for an engineer who still reads code. It builds the call graph of a repo with each language's own tools, with no AI, and writes it as one HTML page, so a reviewer can see where each change sits and how the changed files talk to each other. `docs/adr/` holds the architectural decisions and `docs/product.md` holds the product record.

## Language

A word an entry lists under _Avoid_ can still stand in a settled record. ADR-0001 to ADR-0011 say _flow_, _trace_, _map_ and _reference graph_, because those words named the plan when it was decided. A decision record is not rewritten to match a later decision.

### The graph

**Function**:
One named piece of code that can be called: a function, a method, or a constructor. It is anchored to a file and a line.
_Avoid_: node, symbol, routine

**Call**:
An arrow from one function to a function it calls, proven by the language's own tools.
_Avoid_: edge, link, dependency

**Call graph**:
Every function in scope and every call between them.
_Avoid_: map, dependency graph, reference graph

**Open end**:
A call that the language's tools cannot tie to a function, such as a call on an untyped value or a callback. The page shows it, marked, and it leads nowhere.
_Avoid_: unknown call, gap, hole

**One-of call**:
One of several calls from one call site through an interface or a map of strategies, one to each implementation. Only one of them runs.
_Avoid_: maybe call, possible call

**One-of group**:
The one-of calls of one call site. The page draws them as alternatives, and the resolution rate counts the group as one call.
_Avoid_: call site group, alternative set

**Resolution rate**:
The share of calls into the repo's own code that the language's tools tie to one function: the calls, divided by the calls plus the open ends. A one-of group counts as one call. A call into a library and a call that no named function holds count in neither. It tells the reader how much of the graph the tools proved.
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
What one extractor emits for one repo: its files, its functions, its calls, its open ends, and the scope it was built under.
_Avoid_: graph JSON, payload, manifest

**Reference graph document**:
What the extractors emit before spec 15: the files in scope and the import edges between them. The graph document replaces it for the review, and the Go and Ruby extractors keep it until they emit functions and calls.
_Avoid_: graph document (that holds functions and calls)

**Scope**:
The globs an extractor is run under, which limit which files enter its document, so a monorepo is read one subtree at a time. A glob that starts with `!` leaves out the files that it matches.
_Avoid_: filter, include path, root

**Reader page**:
The one self-contained HTML file that the CLI writes. It holds the whole call graph in scope as data, so the reader can open more of it with no server.
_Avoid_: report, dashboard, artifact

**Editor link**:
The link on a function that opens its file and line in the reader's editor. A removed function has no editor link, because its file and line are gone from the working tree.
_Avoid_: deep link, jump link

**View**:
One drawing of the reader page, chosen with a tab: Diff, Whole project, Folder or Route. A view is a pure function from the page data and the choice of the reader, such as the open level, to boxes, frames and lines. The Diff view opens first. The marks, the open ends, the one-of groups, the selection and the code panel work in every view.
_Avoid_: mode, screen, perspective

**Level**:
One folder of the scope, or one file, that the Whole project view shows at a time. The level of a folder shows its child folders and its files as boxes. The level of a file shows its functions as boxes. The top level is the deepest folder that holds every file in scope. A chain of folders with one child each shows as one box. A folder with only one file shows as the box of that file. So a level never holds a single box. A box counts the changed, added and removed functions inside it. A click on a box opens its level, and the breadcrumb leads back up.
_Avoid_: zoom level, depth, layer

**Outside box**:
A box of a level that stands for code that the open level does not hold, at the far end of a bundled line. It is the first folder or file on the path of that code that does not hold the open level. With `src/orders` open, a call to `src/money/format.ts` ends at the outside box `src/money`. An outside box collapses like the box of that path at its parent level, so a call to `src/tax/rate.ts` ends at the box `src/tax/rate.ts` when `src/tax` holds only that file. A click on an outside box opens the level of that folder or file. An outside box is a folder or a file, and an outside function is a function.
_Avoid_: external box, neighbour box, ghost

**Outside function**:
A function that the Folder view draws but that the chosen folder does not hold: a caller or a callee one hop out of the folder, or a function that the search opened. The view draws it greyed. This is not a review mark, so an outside function is also a neighbour only when it is one hop from a changed function.
_Avoid_: neighbour, external function

### Review

**Review**:
The reader page for one branch: every changed function, one hop around each, and the calls the branch added or removed, against the merge base with the default branch.
_Avoid_: PR view, change summary

**Changed function**:
A function that the branch added, removed, or changed in its body.
_Avoid_: touched function, dirty function

**Hop**:
One call away from a function, in either direction. A caller and a callee are each one hop away.
_Avoid_: step, depth

**Neighbour**:
A function one hop from a changed function that the branch did not change. Every view shows it greyed. In the Diff view, a click opens its own next hop. A function further from the change gets no mark. The hop counts in the base graph and in the branch graph, so the far end of a call that the branch removed is a neighbour too, and the page shows that call.
_Avoid_: context function, related function
