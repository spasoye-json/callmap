# Archmap

Archmap keeps a true map of a software system, business logic first, so a reviewer can see what an AI change touches before it merges.

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions.
- The prototypes that settled the map's shape live in the `archmap-prototype` repo.

## Status

The walking skeleton is done: one flow runs from a TypeScript screen into a Rails controller, through every stage from open to the stale mark. The core seam modules are typed TypeScript packages under `packages/`:

| Package                    | What it owns                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `@archmap/reference-graph` | The ground truth: files, reference edges, and a language tag, merged per extractor |
| `@archmap/flow-document`   | The seam format and the deterministic validator that guards it                     |
| `@archmap/layout`          | The deterministic layout: a rectangle per node and per lane, or a refusal to place  |
| `@archmap/canvas-model`    | What the canvas draws: shapes, inks, folding, evidence, steps, the editor link     |
| `@archmap/flow-library`    | Every flow a repo holds, and the picker a reader switches flows with               |
| `@archmap/staleness`       | The anchor set, the anchor stamp, and the mark                                     |
| `@archmap/scope`           | The scope globs and the skipped directories every walk of a repo shares            |
| `@archmap/discovery`       | The discovery prompt, proposed entry points, and curation                          |
| `@archmap/cost`            | What a pass costs: the estimate, the spend of a pass, and the monthly total        |
| `@archmap/trace`           | The trace prompt, and the reader that holds a trace answer to the validator        |
| `@archmap/testing`         | One mixed-language fixture repo, held as data, that the tests are written against  |

The extractors are here too, and they are not core: they are the other side of the contract.

| Package                         | What it owns                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@archmap/extractor-typescript` | TypeScript and JavaScript: a repo in scope, read into a reference graph document               |
| `@archmap/extractor-go`         | Go: a Go program that reads a repo in scope, each imported package expanded to an edge per file |
| `@archmap/extractor-ruby`       | Ruby: constant references resolved by Zeitwerk conventions, one loader per Rails app           |

No core package reads source code or a target repo's filesystem. An extractor emits the reference graph, the host reads file hashes, and the core only ever sees data. See ADR-0009. The split is guarded, not merely intended: `test/core-is-language-blind-and-pure.test.ts` reads every package's imports and holds the core to it, and holds the extractor to the opposite.

Each extractor runs as its own process and answers over its standard output:

```sh
node packages/extractor-typescript/src/cli.ts <repo> --scope 'src/**'
node packages/extractor-ruby/src/cli.ts <repo> --scope 'apps/**'
go -C packages/extractor-go/go run . <absolute-repo> --scope 'internal/**'
```

The Ruby extractor needs a `ruby` on the `PATH`. It parses with Ripper, which every Ruby ships, so it needs no gem.

The Go extractor uses only the Go standard library and never runs the go tool against the target repo, so it needs no network and no module download. From Node, `extractGo` builds it once per process and reads its document back through the core.

Each extractor commits its own tiny fixture repo under `packages/<extractor>/fixture/`, because an extractor is the one thing here that must be tested against files on disk.

The host runs the app. It is neither core nor an extractor, and the same guard test holds it to its own rules (ADR-0006).

| Package            | What it owns                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `@archmap/sidecar` | The command surface the UI talks to, the extractors it runs, the AI provider, and the map file   |
| `@archmap/app`     | The React and Vite UI, bundled with no network asset, and the Tauri shell in `src-tauri/`        |

The sidecar reads one JSON request per line and writes one JSON response per line:

```sh
echo '{"command":"open","repo":"packages/extractor-typescript/fixture","scope":["src/**"]}' \
  | node packages/sidecar/src/main.ts
```

`open` detects each language that has a file in scope: `.go` for Go, `.rb` for Ruby, and the TypeScript and JavaScript extensions for TypeScript. `extract` runs the extractor of each one and merges the documents by file path into one reference graph. The merge refuses a reference edge between two languages, because that hop is a boundary (ADR-0004). The mixed fixture under `packages/sidecar/fixture/` holds all three languages, and a TypeScript client there calls a Rails route over HTTP.

The Tauri shell starts that process and gives the UI one command, `sidecar`, that carries one line each way. To run the desktop app, install the system libraries Tauri needs (on Fedora: `webkit2gtk4.1-devel libsoup3-devel javascriptcoregtk4.1-devel gtk3-devel librsvg2-devel dbus-devel`), then run `npm run tauri dev -w @archmap/app`. The lint and test gates do not build the Rust shell.

Discovery runs through the same surface (ADR-0010). `estimate-discovery` shows what the pass costs, `discover` runs it and answers with the proposed entry points the validator anchored, and `curate` turns accepted ones into candidates. `map` reads the map file and `account` and `set-key` hold the reader's key and monthly spend. The AI provider is Anthropic on `claude-opus-5-5` with the reader's own key. The key and the spend live in `$ARCHMAP_CONFIG_DIR`, or `$XDG_CONFIG_HOME/archmap`, never in a repo.

Tracing is lazy (ADR-0005). Opening a candidate in the app shows `estimate-trace` first, and `trace` runs the pass, validates the flow over the merged reference graph, and saves it over the candidate. A traced flow is drawn from the map file, so reopening it calls no provider. The canvas is Cytoscape, bundled with the app, on the deterministic layout: pan, zoom, lane folding, the ordered step list, solid verified edges and dashed inferred edges with their evidence on selection. A node click sends `open-in-editor` with a `vscode://file` deep link, and the sidecar hands it to the system opener.

The map file is the `.archmap/` directory the target repo commits (ADR-0007): `flows/<flow id>.json` holds one flow document per flow, `curation.json` holds the rejected proposals, and `flow-anchors.json` holds the anchor stamps (ADR-0008).

Staleness is a content hash of the anchor set (ADR-0008). After `trace` saves a flow, it stamps that flow and no other: the sha256 of every file the flow's nodes point at goes into `flow-anchors.json`. `map` compares each stamp with the files as they stand now and answers with one mark per flow, so the check runs when the map is read and never on a git event. The picker shows `stale` on a flow whose anchored file changed, is gone, or was gained or dropped, and shows no mark on an unchanged one. A stale flow is marked and never traced again on its own. The stamps hash file bytes and hold no absolute path, so a teammate who clones the repo reads the same map and the same marks with no key and no provider call.

The skeleton's proof is `test/the-skeleton-end-to-end.test.ts`. It drives the sidecar command surface with a fake provider over a copy of the mixed fixture: `open`, `extract`, `discover`, `curate`, `trace` and the stamp it leaves, then a change to an anchored Ruby file that `map` answers with as a stale mark. The traced flow has a TypeScript lane and a Ruby lane, and the only edge between them is an inferred `http` edge, drawn dashed, whose evidence quotes the route line in `shop/config/routes.rb`.

### How these modules got here

The `archmap-prototype` repo was not reachable when this port was made, so the modules were written from the rules this repo already pins down: `CONTEXT.md` and `docs/adr/`. They are not a line-for-line copy of the prototype's core, and the prototype's 188 cases were not carried across as themselves. What is here instead is a suite written against the same rules, one case per rule, which is the same guarantee reached a second way. Anyone with the prototype to hand should diff the two suites and fold in whatever case this one is missing.

The TypeScript extractor was written the same way, and its alias resolution is the same guarantee reached a second way rather than a diff against the prototype's extraction: it resolves every specifier with the TypeScript compiler's own resolver, against the target repo's own `tsconfig.json`, which is the resolver the prototype's extraction was built on (ADR-0001). What the extractor calls a reference is therefore what the compiler itself would have imported, alias for alias.

Still to come: the review scene.

Also still to come, and named here because `CONTEXT.md` and `docs/adr/` already define them, so their absence would otherwise read as an oversight: the component map, its components and its unassigned tray, which are the context layer a flow is drawn across (ADR-0002). Also the re-trace of a stale flow and its re-stamp, which ADR-0008 asks for by hand: `trace` refuses a traced flow, so today a stale mark is cleared only when someone puts the candidate back in the flow file by hand and traces it again.

## Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
```

Those two commands are the gate. Nothing else needs running.
