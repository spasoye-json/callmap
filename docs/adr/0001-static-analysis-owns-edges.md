# Static analysis owns every edge, AI only proposes

> Superseded in part by ADR-0012. No AI proposes anything now. The rule that static analysis owns every edge stands, and it now covers every call.

The map's whole value is that a reviewer can trust it, so no edge may exist because a language model said so. The import graph from the TypeScript compiler owns every edge. AI proposes component grouping, names, flow discovery, and flow narration, and each proposal is checked against the graph before it enters the map.

The alternative was to let one AI pass emit the graph directly, which is far less work and reads well. The prototype settled it the other way: a map that is mostly true is worth nothing to a reviewer, because they cannot tell which part is the wrong part.

## Consequences

- Every AI output passes a deterministic validator. See ADR-0003.
- A claim about a file the import graph does not know is rejected, so a hallucinated file cannot carry invented steps.
- Languages without a compiler-grade extractor cannot be supported by adding an AI pass. They need an extractor first.
