# Archmap

Archmap keeps a true map of a software system, business logic first, so a reviewer can see what an AI change touches before it merges.

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions.
- The prototypes that settled the map's shape live in the `archmap-prototype` repo.

## Status

The walking skeleton is under way. The core seam modules are ported, as typed TypeScript packages under `packages/`:

| Package                    | What it owns                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `@archmap/reference-graph` | The ground truth: files, reference edges, and a language tag, merged per extractor |
| `@archmap/flow-document`   | The seam format and the deterministic validator that guards it                     |
| `@archmap/layout`          | The deterministic layout: a rectangle per node and per lane, or a refusal to place  |
| `@archmap/canvas-model`    | What the canvas draws: shapes, inks, lane collapse, evidence on selection          |
| `@archmap/flow-library`    | Every flow a repo holds, and the picker a reader switches flows with               |
| `@archmap/staleness`       | The anchor set, the anchor stamp, and the mark                                     |
| `@archmap/testing`         | One mixed-language fixture repo, held as data, that the tests are written against  |

The extractors are here too, and they are not core: they are the other side of the contract.

| Package                         | What it owns                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `@archmap/extractor-typescript` | TypeScript and JavaScript: a repo in scope, read into a reference graph document      |
| `@archmap/extractor-ruby`       | Ruby: constant references resolved by Zeitwerk conventions, one loader per Rails app  |

No core package reads source code or a target repo's filesystem. An extractor emits the reference graph, the host reads file hashes, and the core only ever sees data. See ADR-0009. The split is guarded, not merely intended: `test/core-is-language-blind-and-pure.test.ts` reads every package's imports and holds the core to it, and holds the extractor to the opposite.

Each extractor runs as its own process and answers over its standard output:

```sh
node packages/extractor-typescript/src/cli.ts <repo> --scope 'src/**'
node packages/extractor-ruby/src/cli.ts <repo> --scope 'apps/**'
```

The Ruby extractor needs a `ruby` on the `PATH`. It parses with Ripper, which every Ruby ships, so it needs no gem. Each extractor commits its own tiny fixture repo under `packages/<extractor>/fixture/`, because an extractor is the one thing here that must be tested against files on disk.

The host runs the app. It is neither core nor an extractor, and the same guard test holds it to its own rules (ADR-0006).

| Package            | What it owns                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `@archmap/sidecar` | The command surface the UI talks to (`open`, `extract`), and the extractors it runs by language |
| `@archmap/app`     | The React and Vite UI, bundled with no network asset, and the Tauri shell in `src-tauri/`        |

The sidecar reads one JSON request per line and writes one JSON response per line:

```sh
echo '{"command":"open","repo":"packages/extractor-typescript/fixture","scope":["src/**"]}' \
  | node packages/sidecar/src/main.ts
```

The Tauri shell starts that process and gives the UI one command, `sidecar`, that carries one line each way. To run the desktop app, install the system libraries Tauri needs (on Fedora: `webkit2gtk4.1-devel libsoup3-devel javascriptcoregtk4.1-devel gtk3-devel librsvg2-devel dbus-devel`), then run `npm run tauri dev -w @archmap/app`. The lint and test gates do not build the Rust shell.

### How these modules got here

The `archmap-prototype` repo was not reachable when this port was made, so the modules were written from the rules this repo already pins down: `CONTEXT.md` and `docs/adr/`. They are not a line-for-line copy of the prototype's core, and the prototype's 188 cases were not carried across as themselves. What is here instead is a suite written against the same rules, one case per rule, which is the same guarantee reached a second way. Anyone with the prototype to hand should diff the two suites and fold in whatever case this one is missing.

The TypeScript extractor was written the same way, and its alias resolution is the same guarantee reached a second way rather than a diff against the prototype's extraction: it resolves every specifier with the TypeScript compiler's own resolver, against the target repo's own `tsconfig.json`, which is the resolver the prototype's extraction was built on (ADR-0001). What the extractor calls a reference is therefore what the compiler itself would have imported, alias for alias.

Still to come: the Go extractor, the canvas in the app, and the review scene.

Also still to come, and named here because `CONTEXT.md` and `docs/adr/` already define them, so their absence would otherwise read as an oversight: discovery and tracing, which are the AI passes that mint a candidate and fill one in (ADR-0005); the component map, its components and its unassigned tray, which are the context layer a flow is drawn across (ADR-0002); the map file that carries curation results (ADR-0007, ADR-0010); and the stamping command of ADR-0008, which exists so a page build can never re-stamp what it was meant to show. The stamping *rules* are here and tested; only the command boundary around them is not.

## Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
```

Those two commands are the gate. Nothing else needs running.
