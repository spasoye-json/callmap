# Archmap, the product record

Settled through two grilling sessions and two prototype rounds, 2026-08-18 and 2026-08-19. This file holds the product and business decisions. `CONTEXT.md` holds the vocabulary, `docs/adr/` holds the architectural decisions, and `.scratch/<feature>/` holds the specs. The prototype verdicts live in the `archmap-prototype` repo.

## Positioning

AI writes code faster than the team can track it. No human holds the map. Archmap keeps a true map of the system, business logic first, and shows what an AI change touches before merge.

- Landing line: "See what the AI actually changed before you merge it."
- Support line: "The map of your system that stays true while AI writes the code."
- User: a staff engineer or a tech lead who reviews AI-generated merge requests daily.
- Daily trigger: the review scene. Check out a branch, see which flows and components it touches.

## Product shape

A local-first desktop companion that sits next to VS Code or JetBrains. See ADR-0006.

The two views, and why flows lead, are ADR-0002. A flow renders as a logic flowchart with pan, zoom, collapse per lane, and click-to-editor. The component map is two levels of curated components over the reference graph, with an unassigned tray for files no glob matches.

## Version one, the review scene

Local git only. The user checks out a branch, the app diffs it against the default branch, and shows changed components, new or removed component edges, and stale-flow badges. Platform integrations with GitHub and GitLab are version two.

Cost is visible: an estimated token cost before a trace, and a running monthly total in the app.

## Technical commitments not covered by an ADR

- Version one ships three extractors: TypeScript with JavaScript, Go, and Ruby on Rails via Zeitwerk. A mixed repo runs every matching extractor over one reference graph, and a cross-language flow is the headline demo. Python comes later. See ADR-0009.
- Entry points are AI-proposed, validator-anchored, and human-curated. See ADR-0010.
- Workspace monorepos from day one. Extractors take scope globs, so a large monorepo is mapped one subtree at a time.
- The UI is React with Vite inside the Tauri shell. Cytoscape is bundled locally, no network on first open.
- Refresh on git events, incremental.
- Anthropic BYOK behind one provider interface. OpenAI-compatible endpoints when a real user asks.

## Cut from version one

Chat over the model, multi-repo, GitHub and GitLab integrations, AI change summaries, runtime data, two-way editor sync, every language that is not TypeScript, JavaScript, Go, or Ruby, and the localhost page served by the engine for a browser.

## Business

- Solo, nights and weekends, no deadline. Bottom-up distribution plus essays on AI-era architecture decay.
- Free public beta with the price shown. At 1.0: about $15 to $20 per seat monthly, free for open-source repos. Beta users keep a grandfathered discount.

## Known risks

- The map file is committed to the repo, so a team gets sharing for free and the app itself must earn the seat. See ADR-0007.
- Understanding tools die as nice-to-haves. CodeSee, Sourcetrail, and Structurizr cloud are the record. Archmap must live inside daily review, not beside it.
- The niche is open. No dedicated desktop architecture IDE exists today.
- The development target is the owner's employer repo. It is local only: nothing from it appears in demos, essays, screenshots, or committed fixtures. Public material uses an open-source mixed repo.

## Next steps

1. Prototype round two, done: the interactive flow canvas and AI flow discovery against a private app. Verdict in the `archmap-prototype` repo, `.scratch/flow-canvas/verdict.md`.
2. The walking skeleton, in this repo. The prototype repo stays as the record, and the seam modules are ported from it, not moved. The skeleton: Tauri shell, Node sidecar, all three extractors, one mixed repo scoped by globs, one traced cross-language flow, one stale badge.
