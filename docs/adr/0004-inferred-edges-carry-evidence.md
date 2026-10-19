# A boundary edge is inferred, carries evidence, and can never be verified

> Superseded by ADR-0012. Archmap is a call graph reader, with no AI.

An HTTP call and an emitted event leave no import behind, so the import graph cannot prove them, yet a flow that stops at the process boundary is not a flow. Boundary edges are therefore a second edge class: inferred. Each one carries the quoted match that proposes it, a route string against a route decorator or an event name against a listener, and the human confirms or rejects it.

A reader who sees that a route string matches a controller exactly will be tempted to promote the edge to verified and drop the evidence. That would erase the one distinction the map exists to keep: what is proven and what is proposed. The validator refuses a boundary edge that claims to be verified.

## Consequences

- Verified and inferred edges are drawn in different inks, and the evidence is readable on selection.
- A verified edge across two files needs the pair in the import graph, in either direction, because import direction and call direction differ when a listener or a callback is registered.
- An inferred edge without evidence is rejected, so the cheap way to fake a link is closed.
