# Staleness is a content hash of the anchor set, not a git diff

> Superseded by ADR-0012. Archmap is a call graph reader, with no AI.

A traced flow is stamped with the hash of every file in its anchor set at trace time. The stamp lives
in `flow-anchors.json` next to the flow documents, and a flow reads as stale when any anchored file no
longer hashes to its stamped value, or is gone.

The alternative was to record the commit the trace was taken against and ask git what changed since.
That is cheaper to write and worse for the product. The review scene is a reader judging an AI change
*before* it merges, so the change is in the working tree and has no commit yet. A content hash sees it,
a commit range does not. A hash also survives a branch switch and a rebase, which move a sha without
moving a line, and it names the file that moved rather than a range that has to be intersected.

The stamp is deliberately not a field on the flow document. ADR 0003 says the document is the one
seam and that changing its shape means changing every stage at once. More than that, the trace pass is
an AI pass, and a hash is exactly the kind of value a model would invent. A script stamps after the
trace, so no model ever writes a hash.

## Consequences

- Stamping is its own command, `node stamp-flow-anchors.mjs <outDir> <flowId>`. It cannot run inside
  the page build, because a build that re-stamped would clear every mark it was meant to show.
- Stamping takes the flow ids and refuses to run without one. A stamp claims "these are the files I
  read", which is only true of the flow that was just traced. A blanket stamp would mint a fresh mark
  for a trace nobody checked, which is exactly what this decision exists to prevent.
- A flow nobody names keeps the stamp it has, and a flow with no stamp gains none, so a rebuild never
  wipes a mark and never invents one.
- The stamp is compared in both directions. A file the document gained since the stamp has never been
  checked, and a file the stamp holds that the document no longer names means the trace was edited
  after it was stamped. Both mark the flow stale.
- A traced flow with no stamp reads as unstamped and a repo that cannot be read reads as unknown.
  Neither reads as fresh, so a missing stamp can never be mistaken for a checked one.
- Marking never re-traces. Clearing a mark takes a re-trace and then a `--restamp`, both by hand.
- The stamp is committed with the flow documents, so a teammate sees the same mark. That follows
  ADR 0007.
