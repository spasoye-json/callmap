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
The box around the file frames and the folder frames of one folder.
_Avoid_: package, directory box

**Bundled line**:
One line between two file frames that stands for 2 or more kept calls between the two files, with their count. A click on it lists its calls. A call that the branch added or removed keeps its own line, so its mark shows.
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
One drawing of the reader page, chosen with a tab: Diff, Whole project, Folder or Route. A view is a pure function from the page data to boxes, frames and lines. The Diff view opens first. The marks, the open ends, the one-of groups and the code panel work in every view.
_Avoid_: mode, screen, perspective

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
_Avoid_: level, step, depth

**Neighbour**:
A function one hop from a changed function that the branch did not change. Every view shows it greyed. In the Diff view, a click opens its own next hop. A function further from the change gets no mark. The hop counts in the base graph and in the branch graph, so the far end of a call that the branch removed is a neighbour too, and the page shows that call.
_Avoid_: context function, related function
