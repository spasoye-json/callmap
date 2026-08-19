# Entry points are AI-proposed, validator-anchored, human-curated

The prototype scan reads NestJS decorators and expo-router files, so a repo with a hand-rolled server gets an empty picker. Framework scanners do not scale across four languages and their frameworks. In the product, one AI pass proposes entry points for any repo that has a reference graph. The validator rejects a proposal whose file the reference graph does not know. A human curates the resulting list, the same pattern that round one settled for components. Framework scanners survive as optional fast-path hint plugins where they exist.

The alternatives were a scanner per framework forever, which multiplies work by every framework in every language, and hand-pinning only, which makes the first open empty and hides the system from a new user.

## Consequences

- The picker is never structurally empty for a repo with a reference graph.
- Curation results live in the committed map file, so a teammate inherits them. See ADR-0007.
- The discovery pass costs tokens, so its estimated cost shows before it runs, the same rule as a trace.
