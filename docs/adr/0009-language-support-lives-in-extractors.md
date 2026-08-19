# Language support lives in extractors, the core is language-blind

The reference graph replaces the import graph as ground truth. Each language gets an extractor, a separate process that emits files, reference edges, and a language tag, and nothing else. The core is ported to typed TypeScript, keeps its tests, and never reads source code. Version one ships three extractors: TypeScript with JavaScript, Go, and Ruby. The Ruby reference graph is constant references resolved by Zeitwerk conventions, one autoload root per Rails app, and edges between apps are boundaries. A mixed repo runs every matching extractor and merges the results into one reference graph. A verified edge never crosses a language. A boundary edge does, and it carries evidence, so a cross-language flow is drawn from the same rules as before.

The alternative was a Rust rewrite of core and extractors on tree-sitter, one binary and no Node sidecar. Tree-sitter gives syntax and not module resolution, so resolution would still be hand-built per language, and the validated core would be re-earned from zero. The rewrite that helps future languages is the narrow contract, not the host language. An extractor's host language stays swappable behind the contract.

This supersedes the wording of ADR-0001 that names the TypeScript compiler as the source of the graph. The rule of ADR-0001 stands: static analysis owns every edge.

## Consequences

- The contract is narrow: the reference graph only. Entry-point hints are optional plugins. See ADR-0010.
- A language without a resolution story has no extractor and no support. Python is the next candidate, after version one.
- An extractor takes scope globs, so a monorepo is mapped one subtree at a time.
- A slow extractor can be rewritten alone, in any language, without touching the core.
- The Node sidecar of ADR-0006 stays, because the core is TypeScript.
