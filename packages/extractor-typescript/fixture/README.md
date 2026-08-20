# The TypeScript fixture repo

A repo the extractor reads, not code this repo ships. Every file is here to make one rule of the
extraction observable, so a reader can tell from the tree what the tests are asserting.

| File                       | What it holds for the extraction                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `tsconfig.json`            | The path aliases `@app/*` and `@shared`, which is where alias resolution lives                  |
| `src/screens/checkout.tsx` | An aliased import, an exact alias, a relative type-only import, and a package nothing installed |
| `src/api/orders-client.ts` | An aliased type-only import and a dynamic import                                                |
| `src/api/receipt.ts`       | The same file imported twice, once for a value and once for a type                              |
| `src/shared/index.ts`      | A re-export, which is a reference like any other                                                |
| `src/shared/money.ts`      | An import of JavaScript from TypeScript                                                         |
| `src/legacy/totals.js`     | A `require` call, which is how JavaScript that predates modules names a file                    |
| `src/legacy/round.js`      | The far end of that call                                                                        |
| `src/lonely.ts`            | A file nothing references and that references nothing                                           |
| `tools/build.ts`           | A subtree outside `src/**`, so a scope glob has something to leave out                          |

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
