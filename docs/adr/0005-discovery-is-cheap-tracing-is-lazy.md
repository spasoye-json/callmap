# Discovery is cheap and eager, tracing is lazy

Discovery runs one AI pass over the repo's routes, screens, and listeners and returns candidates, which is cheap enough to run on first open and gives the user the list of use cases the system contains. Tracing reads the code of one flow and costs real tokens, so it runs the first time the user opens that flow, and never for flows nobody looks at.

The alternative was to trace everything up front, which makes the first open slow and bills the user for flows they will never read. Splitting the two also means a candidate and a traced flow are the same kind of document at different stages, so the canvas and the picker need no second format.

## Consequences

- A candidate is a flow document with no nodes and no edges. The validator enforces that.
- A traced flow is saved, so the cost is paid once.
- Staleness is a mark on an existing trace, not a re-trace. Re-tracing happens on click.
