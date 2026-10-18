# Call resolution on a private app, 2026-10-18

This measurement is the evidence for ADR-0012. It asked one question: can the language's own tools tie each call to its function, with no AI, for at least 90% of calls?

- **The repo:** a private app, a NestJS backend and an Expo mobile app, all TypeScript.
- **The scope:** `server/src` and `mobile-app`, with test files left out. The folder names are invented.
- **The tool:** the TypeScript type checker, through `checker.getResolvedSignature` on each call and each `new`.

## The result

| Part    | Calls into own code | Resolved | Rate  |
| ------- | ------------------- | -------- | ----- |
| Backend | 389                 | 376      | 96.7% |
| Mobile  | 518                 | 512      | 98.8% |

Calls into libraries are leaves and are not counted: 1,761 in the backend and 1,842 in mobile.

The 13 backend misses are of two kinds:

- **Untyped libraries, 11 calls:** `bcrypt.hash`, `bcrypt.compare`, `sharp` and `multer`.
- **A map of strategies, 2 calls:** `this.rules[kind].titleFor` and `this.rules[kind].bodyOf` in `export-targets.service.ts`. These names are invented. The checker knows the interface but not which implementation runs.

## The files

- `calls.cjs` is the measurement script. Run it from the repo root: `node docs/research/2026-10-18-call-resolution/calls.cjs <path to tsconfig.json> [path filter]`.
- `code-to-map.html` is the page that showed the owner the technique. It explains the three passes, shows the numbers, and draws one flow, "place an order", by hand from the code. Archmap later dropped flows and the plan for labels that a model writes, and the page calls the resolution rate "accuracy". It stays as the record of how the decision was made.
