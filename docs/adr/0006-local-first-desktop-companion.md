# A local-first desktop companion, not an editor and not a web app

The product is a Tauri shell with a thin Rust layer and a Node sidecar that runs the analysis engine, with all logic in TypeScript. It sits next to VS Code or JetBrains and opens files there through deep links. It does not replace the editor, and version one has no two-way cursor sync.

A web app would need the code on a server, which kills the local-first promise and the trust that comes with it. An editor plugin would mean building the same thing three times and living inside someone else's canvas. The trade is that packaging and updates are the owner's problem, and the analysis engine cannot assume a server.

## Consequences

- The engine must run on a laptop against a real monorepo, so incremental refresh on git events is a requirement, not a nicety.
- Editor integration is one URL scheme. Anything deeper is out of scope for version one.
- The prototypes in this repo are plain local pages, which keeps them one step away from the shell.
