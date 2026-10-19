---
name: callmap-review
description: Review a branch with Callmap. Use when the user asks for a Callmap review, or asks to see the calls that a branch changed.
---

Run `callmap review` in the repo that the user names, or in the current directory. Pass a flag only when the user asks for it:

- `--base <commit>` for a different base.
- `--scope <glob>` for each subtree, and `--scope '!<glob>'` for each set of files to leave out.
- `--tsconfig <file>` for a TypeScript config that is not at the repo root.
- `--editor jetbrains` for a JetBrains editor.

The command writes the reader page, prints its path and opens it in the browser. Give the user that path. If the command fails, give the user its error text as it is.
