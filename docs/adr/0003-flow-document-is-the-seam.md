# The flow document is the only seam between the pipeline and the canvas

> Superseded by ADR-0012. Archmap is a call graph reader, with no AI.

Discovery, tracing, validation, and the canvas all speak one format: the flow document, one JSON file per flow. The pipeline stages only write it, the canvas only reads it, and a deterministic validator sits in the middle. Nothing else crosses.

The alternative was to let the canvas render whatever an AI pass returned and shape the format as the UI grew. That makes every test a UI test and leaves no place to reject a bad document. With the seam, the honesty rules live in one file and the tests feed documents in and assert acceptance or rejection, with no UI in sight.

## Consequences

- `flow-document.mjs` holds the schema and `validateFlowDocument`. It rejects unknown fields at every level, so a producer cannot smuggle extra keys through.
- A traced flow is a file on disk, so reopening it costs nothing and the canvas needs no server.
- Changing the shape means changing every stage at once. That is the price of one format.
