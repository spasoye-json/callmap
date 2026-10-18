# Flows are the primary object, the component map is the context layer

> Superseded by ADR-0012. Archmap is a call graph reader, with no AI.

The first prototype built both views. The component map showed real imports and honest grouping, and the owner's verdict on it was "I cannot see the business logic from here". The logic-level flow of a single use case scored "fantastic compared to the viewer". So a flow is the primary object of the product, and the component map becomes the layer that flows are drawn across.

This is the reverse of where the work started, and it is the reverse of what most understanding tools ship, so a future reader would otherwise assume the component map is the headline view and build toward it.

## Consequences

- Effort goes to tracing flows and to navigating them, not to prettier component grouping.
- The component map still earns its place: it gives a flow its lanes and its neighbourhood.
- The evidence is in `.scratch/flow-canvas/verdict.md`.
