# Go call resolution on gitea, 2026-10-26

This measurement closes ticket 82 of spec 74. It asks one question: how many calls of an open-source Go repo does the Go extractor tie to their function with `go/types`? The fixes of the code review of spec 74 changed the resolver, so this record holds a second measurement, made after those fixes.

- **The repo:** `go-gitea/gitea` at commit `85211296ddcf2640d7e4110cb0d034cd92cf4c04`, the tip of `main` on 2026-10-26. It is one module, `gitea.dev`, with `go 1.27`.
- **The scope:** the whole repo, once with the test files and once with `--scope '!**/*_test.go'`. The document holds 3,144 Go files with the tests and 2,076 without.
- **The tool:** the Go extractor of the branch `issue/74-review-fixes` at `cb22653`, built with go 1.27.3. Its checker is Go 1.27.3. It ties each call site with `go/types`, as ADR-0024 records.
- **The network:** `go mod download` filled the module cache once, with the network. Each read ran with `GOPROXY=off`.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads and 30 GB of memory. Other agents ran on it, so each time has the load average next to it.

## The commands

```sh
git init gitea && cd gitea
git fetch --depth 1 https://github.com/go-gitea/gitea.git 85211296ddcf2640d7e4110cb0d034cd92cf4c04
git checkout FETCH_HEAD
go mod download

export GOCACHE=<an empty folder>
cd <callmap>/packages/extractor-go/go
GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o /tmp/callmap-extract-go .

GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> > with-tests.json
GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> --scope '!**/*_test.go' > without-tests.json
```

The empty `GOCACHE` makes the first read pay the cold cost of the Go build cache.

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
| With tests    | 3,144 | 16,079    | 81,787         | 3,635                 | 5,353     | 93.9% |
| Without tests | 2,076 | 12,645    | 50,924         | 2,893                 | 1,137     | 97.8% |

Library calls are not counted. `readGraphDocument` accepts both documents. 3 reads of each scope gave the same document byte for byte.

The open ends by reason:

| Open-end reason     | With tests | Without tests |
| ------------------- | ---------- | ------------- |
| `missing-module`    | 0          | 0             |
| `dynamic-key`       | 1          | 1             |
| `untyped`           | 0          | 0             |
| `function-value`    | 5,273      | 1,094         |
| `no-implementation` | 63         | 37            |
| `other`             | 16         | 5             |

No call gave `missing-module` or `untyped`. So no load error hid a callee.

## The cost

The first read compiled the export data of every dependency into the Go build cache. Each later read used that cache.

| Read                  | Wall time | Peak memory  | Load before | Load after |
| --------------------- | --------- | ------------ | ----------- | ---------- |
| The first, with tests | 41.56 s   | 1,187,716 KB | 4.88        | 32.41      |
| Run 1, with tests     | 2.04 s    | 1,178,040 KB | 1.59        | 1.59       |
| Run 1, without tests  | 1.92 s    | 1,074,288 KB | 1.59        | 1.59       |
| Run 2, with tests     | 2.04 s    | 1,123,388 KB | 1.59        | 1.86       |
| Run 2, without tests  | 2.02 s    | 1,079,028 KB | 1.86        | 1.86       |
| Run 3, with tests     | 2.10 s    | 1,150,228 KB | 1.86        | 3.88       |
| Run 3, without tests  | 1.95 s    | 1,042,676 KB | 3.88        | 3.88       |

- **The median of one read:** 2.04 s and 1,150,228 KB with the tests, and 1.95 s and 1,074,288 KB without.
- **The first read** used 596 s of user CPU on 22 threads, and a later read used about 8 s to 9 s. The difference went to the go tool, which compiled the dependencies for `go list -export`. The read itself drove the load average to 32.41.
- **The peak memory** is the maximum resident set size that `/usr/bin/time -v` gives. It is that of the largest process. Samples of `ps` every 0.05 s during one read with the tests put the extractor at 1,127,944 KB at most, and each `go list` below it.
- **The load average** is the 1-minute value of `/proc/loadavg`.

## The causes of open ends

A cause here is finer than the open-end reason. For `no-implementation` it is the interface of the receiver. For `function-value` it is the kind of value that the call calls. A probe, a copy of the extractor that prints this cause for each open end, gave the counts. It emits the same documents as the extractor, and it stays outside the repo. Each scope has fewer than 10 causes, so the tables hold all of them.

With tests:

| #   | Open-end reason     | Cause                                    | Open ends | Most common expressions                                           |
| --- | ------------------- | ---------------------------------------- | --------- | ----------------------------------------------------------------- |
| 1   | `function-value`    | a local variable                         | 3,128     | `test` 337, `cancel` 73, `testSuccess` 69                         |
| 2   | `function-value`    | the result of a call                     | 1,497     | `tests.PrintCurrentTest(t)` 461, `tests.PrepareTestEnv(t)` 325    |
| 3   | `function-value`    | a package variable                       | 244       | `globalVars` 61, `GlobalVars` 27                                  |
| 4   | `function-value`    | a struct field                           | 214       | `LoadedTemplates().BodyTemplates.ExecuteTemplate` 12, `r.CollationEquals` 11 |
| 5   | `function-value`    | a parameter                              | 190       | `linkFormatter` 27, `f` 19, `fn` 13                               |
| 6   | `no-implementation` | `cache.StringCache`                      | 42        | `cache.GetCache().Get` 7, `first.Get` 4, `first.IsExist` 4        |
| 7   | `no-implementation` | `reqctx.RequestContext`                  | 19        | `ctx.SetContextValue` 6, `ctx.GetData` 3, `rc.GetData` 3          |
| 8   | `other`             | a slice element, a map value with a constant key, a dereferenced pointer or a type parameter | 16 | `callback[0]` 11 |
| 9   | `no-implementation` | `gtprof.mutableContext`                  | 2         | `ctx.SetContextValue` 2                                           |
| 10  | `dynamic-key`       | a map value with a key that is not a constant | 1    | `globalVars().systemUserNewFuncs[id]` 1                           |

Without tests:

| #   | Open-end reason     | Cause                                    | Open ends | Most common expressions                                |
| --- | ------------------- | ---------------------------------------- | --------- | ------------------------------------------------------ |
| 1   | `function-value`    | a local variable                         | 586       | `cancel` 46, `finished` 28, `jobLink` 23               |
| 2   | `function-value`    | a package variable                       | 208       | `globalVars` 54, `GlobalVars` 16                       |
| 3   | `function-value`    | a parameter                              | 153       | `linkFormatter` 27, `f` 17, `fn` 12                    |
| 4   | `function-value`    | a struct field                           | 134       | `LoadedTemplates().BodyTemplates.ExecuteTemplate` 9, `a.initDB` 8 |
| 5   | `no-implementation` | `cache.StringCache`                      | 21        | `ctx.Cache.IsExist` 4, `cache.GetCache().Get` 3        |
| 6   | `no-implementation` | `reqctx.RequestContext`                  | 14        | `ctx.SetContextValue` 4, `ctx.GetData` 3               |
| 7   | `function-value`    | the result of a call                     | 13        | `routing.RecordFuncInfo(req.Context(),funcInfo)` 3     |
| 8   | `other`             | a map value with a constant key, a slice element, a dereferenced pointer or a type parameter | 5 | `registeredConfigs[NoType]` 1, `(*fn)` 1 |
| 9   | `no-implementation` | `gtprof.mutableContext`                  | 2         | `ctx.SetContextValue` 2                                |
| 10  | `dynamic-key`       | a map value with a key that is not a constant | 1    | `globalVars().systemUserNewFuncs[id]` 1                |

## Findings

- **The tests add function values.** `defer tests.PrintCurrentTest(t)()` and `defer tests.PrepareTestEnv(t)()` call the cleanup function that a helper returns. They make 786 open ends. A test that calls a closure in a local variable, such as `test` in `cmd/main_test.go`, makes 337 more. So the rate falls from 97.8% to 93.9% with the tests.
- **The database layer is a repo interface with only library implementations.** `models/db/engine.go:105` declares that `*xorm.Engine` and `*xorm.Session` implement `db.Engine`, `db.Session` and `db.EngineMigration`. No type in scope implements them. The owner decided on 2026-10-26 that such a call is a library call, and ADR-0024 records the rule. So 2,138 calls with tests and 1,920 without are library calls now, and the rate does not count them. These counts hold the aliases `base.EngineMigration` and `base.Session` of `modelmigration/base/db.go`.
- **The rest of `no-implementation` takes its methods from an embedded interface.** `stringCache` implements `cache.StringCache`, but it takes `Get`, `Delete`, `IsExist` and `Ping` from the `backend` interface that it embeds. The type that implements `reqctx.RequestContext` takes its methods from `context.Context` and `RequestDataStore` in the same way. The code that runs is not known, so these calls stay open ends.
- **A call through a library interface is the largest group of library calls.** `xorm.io/builder.Cond` gives 424 of them, `error` 418 and `context.Context` 182, with the tests.
- **`go list` is the cold cost.** The first read of a repo takes about 20 times as long as the next one, because the go tool compiles the export data of the dependencies. A review on a new machine pays it once.

The documents, the probe and the scripts of this measurement stay outside the repo.
