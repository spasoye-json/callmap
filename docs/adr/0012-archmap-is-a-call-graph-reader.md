# Archmap is a call graph reader, with no AI

Archmap is a CLI that reads a repo with its language's own tools, builds the call graph of its functions, and writes one self-contained HTML page. The first command is `archmap review`: it shows each function that a branch changed, one hop of callers and callees around it, and the calls the branch added or removed. No model draws, proposes, labels or checks anything.

The owner reviews AI-written code every day and cannot keep up with its volume. The skeleton drew flows of business logic with an AI trace pass, and a week of grilling, 2026-10-12 to 2026-10-18, moved away from it step by step. First Claude was to curate the flows beside a person. Then the owner asked how a map could reach 90% accuracy with no person or agent to confirm it. A measurement on a private app, recorded in `docs/research/2026-10-18-call-resolution/`, answered it: the TypeScript type checker tied 376 of 389 backend calls (96.7%) and 512 of 518 mobile calls (98.8%) to one function in the owner's code, at no token cost, and the same every time. The owner then chose to keep reading code, in a better way: "I am a software engineer and I still want to read code but in an improved way since we cannot keep up with AI written code." A diff shows changed lines in file order. The call graph shows where each change sits and how the changed files talk to each other.

The alternatives were the AI-traced flows of the skeleton, which cost tokens, vary from run to run and need a person to check them, and Repowise, which has a resolved call graph but no review view and no flowchart, as the owner found when they tried it. A desktop app was also the plan. A CLI that writes HTML is less code, works beside any editor, and the page can go with a PR. A Claude skill alone was rejected, because Claude would then draw the graph and it would change from run to run. A thin skill that runs the CLI comes after the CLI works.

This supersedes ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008 and ADR-0010. ADR-0001 stands and is stronger: static analysis owns every call, and nothing else adds one. ADR-0009 and ADR-0011 stand: the core is language-blind, each language has one extractor behind one contract, and the document carries its scope.

## Consequences

- TypeScript comes first, read with the type checker. Go comes next, with the `golang.org/x/tools` call graph. Ruby comes after its resolution rate is measured on an open-source Rails app. Sorbet-based `scip-ruby` is the first tool to measure, and nobody has tested it on Rails code yet.
- A call that the language's tools cannot resolve shows as an open end. A call through an interface or a map of strategies gets one arrow to each implementation, marked as one of them.
- The page shows the resolution rate, so the reader knows how much of the graph the tools proved.
- The Tauri shell, the sidecar, discovery, trace, cost, staleness, flows and the canvas of flows leave the product. The extractors, the scope globs and the editor link stay.
