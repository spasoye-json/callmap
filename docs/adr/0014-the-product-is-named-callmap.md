# The product is named callmap

The product reads the call graph of a repo and shows it on one page (ADR-0012). The old name, archmap, promised a map of the architecture, with layers, flows and services, and the product draws none of them. The name callmap says what the page shows: the functions and the calls between them.

## Consequences

- The command is `callmap`, the packages are `@callmap/*`, and the skill is `skills/callmap-review`.
- The GitHub repo becomes `spasoye-json/callmap`.
- ADR-0001 to ADR-0012, the dated notes in `docs/research/` and the git history keep the name archmap. They record what was true at the time.
