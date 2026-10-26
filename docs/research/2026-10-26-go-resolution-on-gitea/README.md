# Go call resolution on gitea, 2026-10-26

This measurement closes ticket 82 of spec 74. It asks one question: how many calls of an open-source Go repo does the Go extractor tie to their function with `go/types`?

- **The repo:** `go-gitea/gitea` at commit `85211296ddcf2640d7e4110cb0d034cd92cf4c04`, the tip of `main` on 2026-10-26. It is one module, `gitea.dev`, with `go 1.27`.
- **The scope:** the whole repo, once with the test files and once with `--scope '!**/*_test.go'`. The document holds 3,144 Go files with the tests and 2,076 without.
- **The tool:** the Go extractor of the branch `spec/74-go-calls` at `8009458`, built with go 1.27.3. Its checker is Go 1.27.3. It ties each call site with `go/types`, as ADR-0024 records.
- **The network:** `go mod download` filled the module cache once, with the network. Each read ran with `GOPROXY=off`.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads and 30 GB of memory. Other agents ran on it, so each time has the load average next to it.

## The commands

```sh
git init gitea && cd gitea
git fetch --depth 1 https://github.com/go-gitea/gitea.git 85211296ddcf2640d7e4110cb0d034cd92cf4c04
git checkout FETCH_HEAD
go mod download

cd <callmap>/packages/extractor-go/go
GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o /tmp/callmap-extract-go .

GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> > with-tests.json
GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> --scope '!**/*_test.go' > without-tests.json
```

The rate counts as `resolutionRateOf` in `packages/review/src/rate.ts` does. A one-of group counts as one call:

```sh
jq '(([.calls[] | select(.group == null)] | length) + ([.calls[].group // empty] | unique | length)) as $resolved
  | (.openEnds | length) as $open
  | {resolved: $resolved, open: $open, rate: ($resolved / ($resolved + $open))}' with-tests.json
```

The open ends by reason:

```sh
jq '.openEnds | group_by(.reason) | map({(.[0].reason): length}) | add' with-tests.json
```

The most common open-end expressions:

```sh
jq -r '.openEnds[] | "\(.reason) \(.expression | gsub("\\s+"; ""))"' with-tests.json | sort | uniq -c | sort -rn | head
```

## The result

| Scope         | Files | Functions | Resolved calls | One-of groups in them | Open ends | Rate  |
| ------------- | ----- | --------- | -------------- | --------------------- | --------- | ----- |
| With tests    | 3,144 | 16,079    | 80,074         | 1,922                 | 9,059     | 89.8% |
| Without tests | 2,076 | 12,645    | 49,573         | 1,542                 | 4,399     | 91.8% |

Library calls are not counted. `readGraphDocument` accepts both documents. 3 reads of each scope gave the same document byte for byte.

The open ends by reason:

| Open-end reason     | With tests | Without tests |
| ------------------- | ---------- | ------------- |
| `missing-module`    | 0          | 0             |
| `dynamic-key`       | 1          | 1             |
| `untyped`           | 0          | 0             |
| `function-value`    | 5,288      | 1,098         |
| `no-implementation` | 3,769      | 3,299         |
| `other`             | 1          | 1             |

No call gave `missing-module` or `untyped`. So no load error hid a callee.

## The cost

The first read compiled the export data of every dependency into the Go build cache. Each later read used that cache.

| Read                     | Wall time | Peak memory  | Load before | Load after |
| ------------------------ | --------- | ------------ | ----------- | ---------- |
| The first, with tests    | 42.19 s   | 1,167,596 KB | 1.65        | 25.25      |
| Run 1, with tests        | 2.16 s    | 1,186,600 KB | 3.24        | 3.30       |
| Run 1, without tests     | 2.03 s    | 1,025,816 KB | 3.30        | 3.30       |
| Run 2, with tests        | 2.19 s    | 1,125,220 KB | 3.30        | 3.36       |
| Run 2, without tests     | 2.10 s    | 1,070,972 KB | 3.36        | 3.36       |
| Run 3, with tests        | 2.19 s    | 1,058,076 KB | 3.36        | 3.36       |
| Run 3, without tests     | 2.02 s    | 1,065,364 KB | 3.36        | 4.05       |

- **The median of one read:** 2.19 s and 1,125,220 KB with the tests, and 2.03 s and 1,065,364 KB without.
- **The first read** used 583 s of user CPU on 22 threads, and a later read used about 9 s. The difference went to the go tool, which compiled the dependencies for `go list -export`. The read itself drove the load average to 25.25.
- **The peak memory** is the maximum resident set size that `/usr/bin/time -v` gives. It is that of the largest process. A sample of `ps` during one read put the extractor at 1,069,232 KB, and each `go list` below it.
- **The load average** is the 1-minute value of `/proc/loadavg`. An earlier batch of the same 6 reads ran at a load of 17 to 20 and took 1.80 s to 2.01 s.

## The 10 most common causes of open ends

A cause here is finer than the open-end reason. For `no-implementation` it is the interface of the receiver. For `function-value` it is the kind of value that the call calls. A probe, a copy of the extractor that prints this cause for each open end, gave the counts. It emits the same documents as the extractor, and it stays outside the repo.

With tests:

| #   | Open-end reason     | Cause                                                       | Open ends | Most common expressions                          |
| --- | ------------------- | ----------------------------------------------------------- | --------- | ------------------------------------------------ |
| 1   | `function-value`    | a local variable                                            | 3,137     | `test` 337, `cancel` 79, `testSuccess` 69        |
| 2   | `function-value`    | the result of a call                                        | 1,497     | `tests.PrintCurrentTest(t)` 461, `tests.PrepareTestEnv(t)` 325 |
| 3   | `no-implementation` | `db.Engine`, implemented only by xorm                       | 1,310     | `db.GetEngine(ctx).Where`                        |
| 4   | `no-implementation` | `db.EngineMigration`, implemented only by xorm              | 666       | `x.Sync`, `x.Exec`                               |
| 5   | `no-implementation` | `setting.ConfigSection`, a fault of the extractor           | 531       | `sec.Key`                                        |
| 6   | `no-implementation` | `translation.Locale`, a fault of the extractor              | 356       | `ctx.Locale.Tr`, `ctx.Locale.TrString`           |
| 7   | `function-value`    | a package variable                                          | 244       | `globalVars` 61, `GlobalVars` 27                 |
| 8   | `function-value`    | a struct field                                              | 214       | `LoadedTemplates().BodyTemplates.ExecuteTemplate` |
| 9   | `no-implementation` | `setting.ConfigProvider`, a fault of the extractor          | 203       | `rootCfg.Section`                                |
| 10  | `function-value`    | a parameter                                                 | 181       | `linkFormatter` 27, `f` 17, `fn` 13              |

Without tests:

| #   | Open-end reason     | Cause                                              | Open ends | Most common expressions                |
| --- | ------------------- | -------------------------------------------------- | --------- | -------------------------------------- |
| 1   | `no-implementation` | `db.Engine`, implemented only by xorm              | 1,210     | `db.GetEngine(ctx).Where`              |
| 2   | `function-value`    | a local variable                                   | 594       | `cancel` 52, `finished` 28             |
| 3   | `no-implementation` | `db.EngineMigration`, implemented only by xorm     | 548       | `x.Sync`, `x.Exec`                     |
| 4   | `no-implementation` | `setting.ConfigSection`, a fault of the extractor  | 501       | `sec.Key`                              |
| 5   | `no-implementation` | `translation.Locale`, a fault of the extractor     | 315       | `ctx.Locale.Tr`, `ctx.Locale.TrString` |
| 6   | `function-value`    | a package variable                                 | 208       | `globalVars` 54, `GlobalVars` 16       |
| 7   | `no-implementation` | `db.Session`, implemented only by xorm             | 162       | `sess.And`, `sess.OrderBy`             |
| 8   | `no-implementation` | `setting.ConfigProvider`, a fault of the extractor | 162       | `rootCfg.Section`                      |
| 9   | `function-value`    | a parameter                                        | 145       | `linkFormatter` 27, `f` 16             |
| 10  | `function-value`    | a struct field                                     | 134       | `a.initDB` 8, `opts.LogDetail` 6       |

`db.EngineMigration` and `db.Session` count their aliases `base.EngineMigration` and `base.Session` of `modelmigration/base/db.go`.

## Findings

- **The tests add function values.** `defer tests.PrintCurrentTest(t)()` and `defer tests.PrepareTestEnv(t)()` call the cleanup function that a helper returns. They make 786 open ends. A test that calls a closure in a local variable, such as `test` in `cmd/main_test.go`, makes 337 more. So the rate falls from 91.8% to 89.8% with the tests.
- **The database layer is a repo interface with only library implementations.** `models/db/engine.go:105` declares that `*xorm.Engine` and `*xorm.Session` implement `db.Engine`, `db.Session` and `db.EngineMigration`. No type in scope implements them, so the rule of spec 74 gives `no-implementation`. This makes 2,138 open ends with tests and 1,920 without. A call through such an interface leads only to library code. No ADR decides whether it is a library call.
- **The extractor has a fault: it compares the parameter names of a method.** `signatureOf` in `packages/extractor-go/go/interfaces.go` compares `types.TypeString` of the method type, and that text holds the parameter names. `translation.Locale` declares `Tr(key string, args ...any)`, and `*locale` implements it with `Tr(s string, args ...any)`. The texts differ, so the type does not count as an implementation. `setting.ConfigSection`, `translation.Locale`, `setting.ConfigProvider` and `storage.ObjectStorage` lose their one-of groups this way. `storage.ObjectStorage` fails on the names inside a `func` parameter.
- **The rate with the fault fixed.** The probe compared the types with no names, at every depth. It gave 1,481 more one-of groups with tests and 1,260 without. The rate rose to 91.5% with the tests and 94.2% without. This number is from the probe, not from the branch.
- **`go list` is the cold cost.** The first read of a repo takes about 20 times as long as the next one, because the go tool compiles the export data of the dependencies. A review on a new machine pays it once.

The documents, the probe and the scripts of this measurement stay outside the repo.
