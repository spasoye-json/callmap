# Archmap

Archmap is a call graph reader for an engineer who still reads code. It will read a repo with each language's own tools, with no AI, and write one HTML page for a code review. The page will show where each change of a branch sits and how the changed files talk to each other.

The reader is in progress under spec 15. The command `archmap review` comes with that spec.

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions. ADR-0012 tells how Archmap became a call graph reader.
- `docs/research/` holds the measurements and the research behind the decisions.

## Packages

The core packages read data and never read source code or a filesystem. See ADR-0009.

| Package                    | What it owns                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `@archmap/reference-graph` | The document an extractor emits today: files, references, a language tag and a scope |
| `@archmap/scope`           | The scope globs and the skipped directories that every walk of a repo shares         |
| `@archmap/editor-link`     | The editor link that opens a file at a line                                          |

The extractors are the other side of the contract. Each one reads a repo and names its language.

| Package                         | What it owns                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `@archmap/extractor-typescript` | TypeScript and JavaScript, resolved with the TypeScript compiler's own resolver |
| `@archmap/extractor-go`         | Go, read by a Go program that uses only the Go standard library                 |
| `@archmap/extractor-ruby`       | Ruby, with constants resolved by Zeitwerk conventions, one loader per Rails app |

`test/core-is-language-blind-and-pure.test.ts` reads the imports of every package. It holds the core away from the filesystem and from any language name. It holds each extractor to the opposite.

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
