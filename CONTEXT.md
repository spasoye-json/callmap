# Archmap

Archmap keeps a true map of a software system, business logic first, so a reviewer can see what an AI change touches before it merges. This repo holds the Archmap product. The prototypes that settled the map's shape live in the `archmap-prototype` repo. `docs/adr/` holds the architectural decisions and `docs/product.md` holds the product record.

## Language

A word an entry lists under _Avoid_ can still stand in a settled record. ADR-0001 and ADR-0004 say _import graph_, because that is what the ground truth was called when they were decided, and ADR-0009 records its replacement by the reference graph. A decision record is not rewritten to match a later decision.

### Flows

**Flow**:
One use case traced end to end, from the screen that starts it to the last side effect it causes.
_Avoid_: journey, path, trace (as a noun), use case

**Flow document**:
The record of one flow as data: its entry point, its lanes, its nodes, and its edges. Every producer writes it and every consumer reads it.
_Avoid_: flow file, flow JSON, diagram data

**Proposal**:
An entry point the discovery pass proposes for a flow, before a person decides on it. The validator rejects a proposal whose file the reference graph does not know. A person accepts a proposal, which makes it a candidate, or rejects it.
_Avoid_: suggestion, guess, candidate (before it is accepted)

**Candidate**:
A flow that is named and anchored to an entry point but not yet traced. It carries no nodes and no edges.
_Avoid_: proposal, stub, draft flow

**Traced flow**:
A flow whose nodes and edges are read from the code.
_Avoid_: complete flow, resolved flow, expanded flow

**Entry point**:
The place where a flow starts: a route, a screen, or an event listener.
_Avoid_: trigger, origin, start node

**Lane**:
One side of a process boundary that a flow crosses, such as the mobile app, the backend request, or the async listeners. A lane groups the nodes that run in the same place.
_Avoid_: swimlane, tier, layer, subgraph

**Node**:
One point in a flow, anchored to a file and a line. Its kind is a step, a decision, an error exit (`error` in a flow document), or a side effect (`side-effect`).
_Avoid_: block, box, vertex

**Decision**:
A node where the code branches.
_Avoid_: condition, guard, check, gate

**Error exit**:
A node where the flow stops early and reports a failure.
_Avoid_: failure path, unhappy path, exception branch

**Side effect**:
A node where the flow changes state outside itself: a row written, a message sent, an event emitted.
_Avoid_: mutation, write, action

### Truth and evidence

**Reference graph**:
Every static reference edge between the repo's files, emitted by the language's extractor: imports for TypeScript and Go, resolved constant references for Ruby. It is the ground truth that a claim about the code is checked against.
_Avoid_: import graph, dependency graph, module graph, call graph

**Extractor**:
The per-language pass that produces the reference graph. The core never reads source code, only what an extractor emits.
_Avoid_: parser, analyzer, scanner

**Reference graph document**:
What one extractor emits for one repo: the files it claims, the reference edges between them, its language tag, and the scope it was built under. The core owns the contract and every extractor conforms to it.
_Avoid_: graph JSON, payload, manifest

**Scope**:
The globs an extractor is run under, which limit which files enter its document, so a monorepo is mapped one subtree at a time. A document built under no glob was built over the whole repo.
_Avoid_: filter, include path, root

**Edge**:
A link from one node to the next in a flow.
_Avoid_: arrow, transition, connection

**Verified edge**:
An edge the reference graph proves, because the two nodes sit in one file or in a pair of files with a reference edge between them.
_Avoid_: real edge, static edge, confirmed edge

**Inferred edge**:
An edge no static reference can prove, because it crosses a process boundary. It is proposed, not proven, and it must carry evidence.
_Avoid_: guessed edge, soft edge, virtual edge

**Boundary**:
The kind of hop an inferred edge crosses: an HTTP call or an emitted event.
_Avoid_: bridge, gap, seam (seam means a code interface, not a process hop)

**Evidence**:
The quoted match that proposes an inferred edge, such as a route string that matches a route decorator, or an event name that matches a listener.
_Avoid_: proof, justification, reason

### The component map

**Component**:
A curated group of files, pinned to real directories and files by globs and pins. Components are the context layer that flows are drawn across.
_Avoid_: module, package, service, box

**Component map**:
The whole set of components and the edges between them, aggregated from the reference graph.
_Avoid_: architecture diagram, system map, overview

**Unassigned tray**:
The holding place for files that no component glob matches.
_Avoid_: other, misc, orphans

### Keeping the map true

**Discovery**:
The pass that enumerates a repo's flow candidates from its entry points.
_Avoid_: scanning, crawling, indexing

**Trace**:
The pass that reads the code of one flow and fills in its nodes and edges.
_Avoid_: expand, resolve, analyse

**Flow picker**:
The list of every flow document a repo holds, traced flows openable and candidates greyed out. It is how a reader switches flows inside one page.
_Avoid_: flow list, sidebar, index

**Anchor set**:
Every file and line a flow's nodes point at. A change inside the anchor set is what makes a flow stale.
_Avoid_: footprint, touched files, dependencies

**Stale flow**:
A traced flow whose anchor set contains a file that changed since the trace. It is marked, not re-traced.
_Avoid_: dirty flow, outdated flow, invalid flow

**Anchor stamp**:
The hash of every file in a flow's anchor set, recorded at trace time. Comparing it against the files today is what marks a flow stale.
_Avoid_: snapshot, fingerprint, checksum record

**Map file**:
The committed record of the map, so it travels with git and a teammate can read it without the app.
_Avoid_: config, manifest, cache
