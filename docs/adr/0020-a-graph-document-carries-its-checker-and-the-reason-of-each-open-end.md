# A graph document carries its checker and the reason of each open end

A graph document gets 2 required fields. The document names its checker: the name and the full version of the tool that proved its calls, such as TypeScript 6.0.3. Each open end names its open-end reason, as one code from a fixed list:

| Code                | Page words                 | The cause                                                                  |
| ------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `missing-module`    | module not found           | the callee comes from an import that does not resolve                      |
| `dynamic-key`       | dynamic key                | the callee is read from an object with a key that is not a literal         |
| `untyped`           | untyped value              | the callee has no type, such as `any` in TypeScript                        |
| `function-value`    | function value             | the callee is a value of a function type: a callback, a field, a map value |
| `no-implementation` | no implementation in scope | the callee is an interface member, an abstract member or a declaration only |
| `other`             | not resolved               | none of the causes above                                                   |

When 2 causes fit one open end, the first code in the table names it. The core refuses a document that names no checker, an open end that names no reason, and a code that is not in the table. The core does not read the checker. It carries it to the page. The page owns the words for each code.

## Why

The redesign of spec 53 shows a reason on each open end and the TypeScript version next to the resolution rate. The page data held neither, so spec 53 left them out. The owner chose this shape in the triage of issue 60 on 2026-10-22.

- **A code, not text from the extractor.** The design shows "gateway is any", which repeats the name that the expression already shows. Free text would put the words of one language into the page, and the core could not refuse a bad value, which ADR-0003 asks for. A fixed code also fits a later extractor: `interface{}` in Go is `untyped`, and a `func` field is a `function-value`.
- **The codes follow the cause, not the resolver.** A probe ran 20 kinds of call through the TypeScript extractor on 2026-10-22. The resolver has 3 exits that make an open end, and the causes do not follow them. A call on an `any` field takes one exit, and a call of an `any` parameter takes another. One exit also holds callbacks, map values and `declare` functions. So the extractor finds the reason from the call site, not from the exit.
- **`other` is in the list.** An extractor meets a call that nobody foresaw. With `other`, it still emits a valid document, and the page still shows the open end.
- **The checker lives in the document.** The version describes how the document was made, so ADR-0011's rule applies: a field that has to be remembered next to a document belongs in the document. The CLI could read the version of `typescript` itself, as the base cache key does. But that puts knowledge of one language into the host, against ADR-0009.
- **The checker is the extractor's tool.** The TypeScript extractor runs its own `typescript` dependency, not the one that the repo under review installs. So the page names the tool that proved the calls. The page shows the full version, because a patch version can change the resolution rate.
- **Both fields are required.** ADR-0011 makes the scope required for the same reason: a reader never guesses a field that an extractor left out.

This supersedes the sentence of ADR-0011 that says the scope is the one field added to the contract. The rule of ADR-0009 and ADR-0011 stands: the contract is narrow, and the core is language-blind.

## Consequences

- Every extractor that emits a graph document must find a reason for each open end and name its checker. Today only the TypeScript extractor emits one.
- The base cache key holds a hash of the extractor source, so a cached document from before this change misses the cache and is read again.
- A new code is a change to the contract. It needs a change to the core, to each extractor and to the page words.
- 2 runs on the same source and the same extractor still write the same document, because the reason and the checker depend on nothing else.
