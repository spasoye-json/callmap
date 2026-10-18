# Archmap

Archmap is a code reader for an engineer who still reads code. It builds the call graph of a repo with each language's own tools, with no AI, and writes it as one HTML page, so a reviewer can see where each change sits and how the changed files talk to each other. `docs/adr/` holds the architectural decisions and `docs/product.md` holds the product record.

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

**Resolution rate**:
The share of calls into the repo's own code that the language's tools tie to one function. It tells the reader how much of the graph the tools proved.
_Avoid_: accuracy, confidence, coverage

**File frame**:
The box around the functions of one file.
_Avoid_: group, cluster, module

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
The globs an extractor is run under, which limit which files enter its document, so a monorepo is read one subtree at a time.
_Avoid_: filter, include path, root

**Reader page**:
The one self-contained HTML file that the CLI writes. It holds the whole call graph in scope as data, so the reader can open more of it with no server.
_Avoid_: report, dashboard, artifact

**Editor link**:
The link on a function that opens its file and line in the reader's editor.
_Avoid_: deep link, jump link

### Review

**Review**:
The reader page for one branch: every changed function, one hop around each, and the calls the branch added or removed, against the merge base with the default branch.
_Avoid_: diff view, PR view, change summary

**Changed function**:
A function that the branch added, removed, or changed in its body.
_Avoid_: touched function, dirty function

**Hop**:
One call away from a function, in either direction. A caller and a callee are each one hop away.
_Avoid_: level, step, depth

**Neighbour**:
A function one hop from a changed function that the branch did not change. The review shows it greyed, and a click opens its own next hop.
_Avoid_: context function, related function
