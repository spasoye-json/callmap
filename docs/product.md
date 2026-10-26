# Callmap, the product record

Settled through two grilling sessions and two prototype rounds in 2026-08, and changed by the grilling of 2026-10-12 to 2026-10-18. This file holds the product decisions. `GLOSSARY.md` holds the vocabulary and `docs/adr/` holds the architectural decisions. ADR-0012 tells how the product became a call graph reader. The records of 2026-08 and the prototype verdicts live in the `archmap-prototype` repo. The measurement behind the reader is in `docs/research/2026-10-18-call-resolution/`.

## Positioning

AI writes code faster than an engineer can review it. Callmap does not replace reading the code. It makes reading faster: it shows where each change sits in the call graph and how the changed files talk to each other.

- User: the owner first, an engineer who reviews AI-written code every day on TypeScript, Go and Ruby repos.
- Daily trigger: the review of a branch, a pull request or a merge request.
- Second use: reading any part of a repo by its calls, from the same page.
- No AI. Static rules prove every function and every call, with no guess, so the same code always gives the same page. For TypeScript and Go, the rules are the type checker. Ruby has no type checker, so Callmap's own rules prove its calls (ADR-0027).

## The MVP

A CLI that writes one self-contained HTML page. See ADR-0012.

- **`callmap review`:** reads the git diff of the branch against the merge base with the default branch. It shows each changed function, marked added, removed or changed, and one hop of callers and callees around it, greyed. It marks the calls that the branch added or removed. A click on a greyed function opens its next hop.
- **The page:** each function is a box inside the frame of its file, and each call is an arrow. A click on a box shows its code in a read-only panel. An editor link opens the file and line in the editor.
- **What the page holds:** the whole call graph in scope as data, so the reader can search any function and walk its calls with no server.
- **Honesty:** the page shows the resolution rate. A call that the tools cannot resolve is an open end. A call through an interface shows as one-of calls.
- **A thin Claude skill:** after the CLI works, a skill of about 10 lines tells Claude to run `callmap review` and open the page. It adds no logic.

## Languages

- TypeScript first, read with the type checker. On a private app it resolved 96.7% of backend calls and 98.8% of mobile calls.
- Go next, read with `go/types` at each call site, with load errors allowed (ADR-0024). On `go-gitea/gitea` at `85211296` it resolved 93.9% of calls with tests and 97.8% without. See `docs/research/2026-10-26-go-resolution-on-gitea/`.
- Ruby after Go, read with Zeitwerk naming, the class chain and a local type flow, with no guess (ADR-0027). The open-source record runs on `mastodon/mastodon`.
- A review reads one graph document for each language and shows one rate for each (ADR-0025).
- The core is language-blind. A new language costs one extractor. See ADR-0009.

## Cut from the MVP

Every AI pass, flows of business logic, the branches inside a function, components, the system view, the desktop app, platform integrations with GitHub and GitLab, and hops across HTTP calls or events.

## Known risks

- VS Code and GoLand already show the call hierarchy of one function. Callmap earns its place only with the view of a whole branch across files and languages.
- Understanding tools die as nice-to-haves. CodeSee, Sourcetrail, and Structurizr cloud are the record. Callmap must live inside the daily review.
- The Ruby resolution rate is low. On a private Rails app, the rules tied about a third of the calls before any type flow, so many methods show as entry points and the Route view helps less.
- Nothing from the owner's employer repos appears in demos, essays, screenshots, or committed fixtures. Public material uses a private app of the owner and open-source repos.

## Next steps

1. Spec 2, the reader MVP for TypeScript, proven on a private app. This is issue 15, with tickets 16 to 22.
2. Issue 60, the checker and the open-end reason in the graph document.
3. The Go spec, with its record on `go-gitea/gitea`.
4. The Ruby spec, whose first ticket measures the local type flow on `mastodon/mastodon`.
