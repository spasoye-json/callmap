# A review reads one graph document for each language

`callmap review` runs each extractor whose language has files in scope, and the review reads one graph document for each language. The page draws them as one call graph. A call never crosses a language. The page shows one resolution rate and one checker for each language. The owner made these decisions in a grilling on 2026-10-23 and 2026-10-24.

This supersedes the sentence of ADR-0009 that says a boundary edge crosses a language and carries evidence. No call of the graph crosses a language now. It also changes ADR-0016 and ADR-0021 where they say that the review starts only the TypeScript extractor.

## Decisions

1. **The CLI picks the extractors.** It runs each extractor whose language has at least one file in scope. A language with no tool on the `PATH`, such as Go with no `go`, is skipped, and the CLI prints one line that names it.
2. **The review takes a list.** The review input holds a list of graph documents, one for each language. Each document keeps its own language, scope, checker and open ends. The function ids of one document never meet the ids of another, because a call never crosses a language.
3. **One rate and one checker for each language.** The page shows them side by side, such as "Go 1.27.3 · 95%" and "TypeScript 6.0.3 · 97%".
4. **One cache entry for each language.** The base cache keys each entry on the commit, the scope, the lock files and the version of that one extractor. A run that skips Go then cannot reuse a Go entry by mistake, and a new Go extractor does not empty the TypeScript entries.
5. **Go and Ruby read the base and the branch one after the other.** TypeScript keeps both reads in parallel.

## Why

- **One page for a mixed branch.** A branch of the owner often changes Go and TypeScript together. 2 pages would hide the files that the branch changed in the other language.
- **No call crosses a language.** ADR-0009 planned boundary edges with evidence, such as an HTTP route from a TypeScript client to a Go handler. `docs/product.md` cuts hops across HTTP calls and events from the MVP. A call that crosses a language would need evidence that no language's tools prove.
- **A rate for each language.** The Go rate and the Ruby rate differ a lot. One mixed rate hides the weak language, and the reader cannot tell which part of the graph to trust.
- **One read after the other for Go and Ruby.** A Go read of a large repo takes several GB of memory. 2 reads in parallel can take the memory of a laptop. The base cache hits on most later runs, so the second read costs time only once.

## Consequences

- `resolutionRateOf` takes one document, and the page data holds a list of rates and checkers.
- The reader page names the language only through its rate, its checker and the file names. A box carries no language mark.
- A new language costs one extractor and one entry in the list of the CLI.
