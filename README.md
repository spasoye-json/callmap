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
| `@archmap/layout`          | The deterministic layout: a document in, a rectangle per node and per lane out      |
| `@archmap/canvas-model`    | What the canvas draws: shapes, inks, lane collapse, evidence on selection          |
| `@archmap/flow-library`    | Every flow a repo holds, and the picker a reader switches flows with               |
| `@archmap/staleness`       | The anchor set, the anchor stamp, and the mark                                     |
| `@archmap/testing`         | One mixed-language fixture repo, held as data, that the tests are written against  |

No core package reads source code or a target repo's filesystem. An extractor emits the reference graph, the host reads file hashes, and the core only ever sees data. See ADR-0009.

### How these modules got here

The `archmap-prototype` repo was not reachable when this port was made, so the modules were written from the rules this repo already pins down: `CONTEXT.md` and `docs/adr/`. They are not a line-for-line copy of the prototype's core, and the prototype's 188 cases were not carried across as themselves. What is here instead is a suite written against the same rules, one case per rule, which is the same guarantee reached a second way. Anyone with the prototype to hand should diff the two suites and fold in whatever case this one is missing.

Still to come: the Tauri shell, the Node sidecar, the three extractors, scope globs, and the review scene.

Also still to come, and named here because `CONTEXT.md` and `docs/adr/` already define them, so their absence would otherwise read as an oversight: discovery and tracing, which are the AI passes that mint a candidate and fill one in (ADR-0005); the component map, its components and its unassigned tray, which are the context layer a flow is drawn across (ADR-0002); the map file that carries curation results (ADR-0007, ADR-0010); and the stamping command of ADR-0008, which exists so a page build can never re-stamp what it was meant to show. The stamping *rules* are here and tested; only the command boundary around them is not.

## Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
```

Those two commands are the gate. Nothing else needs running.
