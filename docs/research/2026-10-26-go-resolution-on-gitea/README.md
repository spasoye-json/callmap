# Go call resolution on gitea, 2026-10-26

This measurement closes ticket 82 of spec 74. It asks one question: how many calls of an open-source Go repo does the Go extractor tie to their function with `go/types`? Two rounds of code review of spec 74 changed the extractor, so this record holds a third measurement, made after the second round of fixes.

- **The repo:** `go-gitea/gitea` at commit `85211296ddcf2640d7e4110cb0d034cd92cf4c04`, the tip of `main` on 2026-10-26. It is one module, `gitea.dev`, with `go 1.27`.
- **The scope:** the whole repo, once with the test files and once with `--scope '!**/*_test.go'`. The document holds 3,144 Go files with the tests and 2,076 without.
- **The tool:** the Go extractor of the branch `spec/74-go-calls`, built with go 1.27.3. Its source is the tree `c30ead5` of `packages/extractor-go/go`, which the commit `chore: fix review round 2 findings` holds. Its checker is Go 1.27.3. It ties each call site with `go/types`, as ADR-0024 records. The tree `6f9bf03`, after the fifth round of fixes, gives the same 2 documents byte for byte.
- **The network:** `go mod download` filled the module cache once, with the network. Each read ran with `GOPROXY=off`.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads and 30 GB of memory. Other agents ran on it, so each time has the load average next to it.

## The commands

```sh
git init gitea && cd gitea
git fetch --depth 1 https://github.com/go-gitea/gitea.git 85211296ddcf2640d7e4110cb0d034cd92cf4c04
git checkout FETCH_HEAD
go mod download

export GOCACHE=<an empty folder>
mkdir <source> && git -C <callmap> archive c30ead5 | tar -x -C <source>
cd <source>
GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o /tmp/callmap-extract-go .

for run in 1 2 3; do
  GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> > with-tests-$run.json
  GOPROXY=off /usr/bin/time -v /tmp/callmap-extract-go <gitea> --scope '!**/*_test.go' > without-tests-$run.json
done
cp with-tests-1.json with-tests.json
cp without-tests-1.json without-tests.json
```

The empty `GOCACHE` makes the first read pay the cold cost of the Go build cache. The cost table below holds that first read and 3 more reads of each scope.

The files, the functions and the one-of groups:

```sh
jq '{files: (.files | length), functions: (.functions | length), groups: ([.calls[].group // empty] | unique | length)}' with-tests.json
```

The rate counts as `resolutionRateOf` in `packages/review/src/rate.ts` does. A one-of group counts as one call:

```sh
jq '(([.calls[] | select(.group == null)] | length) + ([.calls[].group // empty] | unique | length)) as $resolved
  | (.openEnds | length) as $open
  | {resolved: $resolved, open: $open, rate: ($resolved / ($resolved + $open))}' with-tests.json
```

The 3 reads of each scope, byte for byte. Each scope gives one hash for its 3 documents:

```sh
sha256sum with-tests-*.json without-tests-*.json
```

The extractor at `b198910`, before the second round of fixes, gives the same 2 documents when `cmp` prints no line. The extractor of the tree `6f9bf03`, after the fifth round of fixes, does too:

```sh
mkdir <old source> && git -C <callmap> archive b198910:packages/extractor-go/go | tar -x -C <old source>
cd <old source>
GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o /tmp/callmap-extract-go-b198910 .
GOPROXY=off /tmp/callmap-extract-go-b198910 <gitea> | cmp - <source>/with-tests.json
GOPROXY=off /tmp/callmap-extract-go-b198910 <gitea> --scope '!**/*_test.go' | cmp - <source>/without-tests.json

mkdir <new source> && git -C <callmap> archive 6f9bf03 | tar -x -C <new source>
cd <new source>
GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o /tmp/callmap-extract-go-6f9bf03 .
GOPROXY=off /tmp/callmap-extract-go-6f9bf03 <gitea> | cmp - <source>/with-tests.json
GOPROXY=off /tmp/callmap-extract-go-6f9bf03 <gitea> --scope '!**/*_test.go' | cmp - <source>/without-tests.json
```

`readGraphDocument` accepts both documents when this prints `accepted`. Run it from the callmap checkout:

```sh
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { readGraphDocument } from '@callmap/graph-document'; for (const file of process.argv.slice(1)) readGraphDocument(JSON.parse(readFileSync(file, 'utf8'))); console.log('accepted');" with-tests.json without-tests.json
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
| Without tests | 2,076 | 12,645    | 50,924         | 2,893                 | 1,232     | 97.6% |

The rate does not count a library call. `readGraphDocument` accepts both documents. 3 reads of each scope gave the same document byte for byte. The extractor at `b198910`, before the second round of fixes, gives the same 2 documents byte for byte. The extractor of the tree `6f9bf03`, after the fifth round of fixes, gives them too. So the second to the fifth round changed no number on gitea. The first round changed some numbers, as the findings below say.

The open ends by reason:

| Open-end reason     | With tests | Without tests |
| ------------------- | ---------- | ------------- |
| `missing-module`    | 0          | 0             |
| `dynamic-key`       | 1          | 1             |
| `untyped`           | 0          | 0             |
| `function-value`    | 5,274      | 1,095         |
| `no-implementation` | 63         | 132           |
| `other`             | 15         | 4             |

No call gave `missing-module` or `untyped`. So no load error hid a callee.

## The cost

The first read compiled the export data of every dependency into the Go build cache. Each later read used that cache.

| Read                  | Wall time | Peak memory  | Load before | Load after |
| --------------------- | --------- | ------------ | ----------- | ---------- |
| The first, with tests | 40.44 s   | 1,219,024 KB | 11.33       | 25.62      |
| Run 1, with tests     | 2.08 s    | 1,222,248 KB | 25.62       | 25.65      |
| Run 1, without tests  | 1.31 s    | 580,004 KB   | 25.65       | 25.65      |
| Run 2, with tests     | 2.05 s    | 1,212,016 KB | 25.65       | 23.91      |
| Run 2, without tests  | 1.27 s    | 609,524 KB   | 23.91       | 23.91      |
| Run 3, with tests     | 2.05 s    | 1,243,852 KB | 23.91       | 23.91      |
| Run 3, without tests  | 1.25 s    | 605,168 KB   | 23.91       | 23.91      |

- **The median of one read:** 2.05 s and 1,222,248 KB with the tests, and 1.27 s and 605,168 KB without.
- **The first read** used 592 s of user CPU on 22 threads, and a later read used about 4 s to 9 s. The difference went to the go tool, which compiled the dependencies for `go list -export`. The load average rose from 11.33 to 25.62 during the first read.
- **The peak memory** is the maximum resident set size that `/usr/bin/time -v` gives. It is that of the largest process. Samples of `ps` every 0.05 s during one read with the tests put the extractor at 1,133,112 KB at most, and each `go list` below it.
- **A read without the tests takes about half the memory of a read with them.** The test variants load only when a test file is in scope, as ADR-0028 says.
- **The load average** is the 1-minute value of `/proc/loadavg`.

`/usr/bin/time -v` gives the wall time, the user CPU and the peak memory of each read. The load average comes from `cut -d' ' -f1 /proc/loadavg` before and after each read. The samples of `ps` come from this loop:

```sh
GOPROXY=off /tmp/callmap-extract-go <gitea> > /dev/null &
pid=$!
max=0
while kill -0 "$pid" 2> /dev/null; do
  rss=$(ps -o rss= -p "$pid" | tr -d ' ')
  if [ -n "$rss" ] && [ "$rss" -gt "$max" ]; then max=$rss; fi
  sleep 0.05
done
echo "$max KB"
```

## The open ends in detail

A detail here is finer than the open-end reason. For `no-implementation` it is the interface of the receiver. For `function-value` it is the kind of value that the call calls. For `other` it is the kind of expression that the call calls. A probe gives the details. It is the extractor of the tree `c30ead5` with `probe.patch`. The patch prints a line to standard error for each open end and each call through an interface. The documents of the probe are the same as those of the extractor, byte for byte. `probe.sh` builds the probe from a callmap checkout and reads gitea with it, once with the tests and once without:

```sh
docs/research/2026-10-26-go-resolution-on-gitea/probe.sh <callmap> <gitea> <out>
cd <out>
```

The documents of the probe and of the extractor, byte for byte. `cmp` prints nothing when they are the same:

```sh
cmp with-tests.json <reads>/with-tests.json
cmp without-tests.json <reads>/without-tests.json
```

The open ends by detail:

```sh
awk -F'\t' '$1 == "OPEN" {print $2 "\t" $3}' with-tests.tsv | sort | uniq -c | sort -rn
```

The most common expressions of one detail:

```sh
awk -F'\t' -v detail='a local variable' '$1 == "OPEN" && $3 == detail {print $4}' with-tests.tsv | sort | uniq -c | sort -rn | head -3
```

The scope with the tests has 12 details, and the scope without them has 13. The tables hold all of them, most common first.

With tests:

| #   | Open-end reason     | Detail                                        | Open ends | Most common expressions                                                       |
| --- | ------------------- | --------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| 1   | `function-value`    | a local variable                              | 3,128     | `test` 337, `cancel` 73, `testSuccess` 69                                     |
| 2   | `function-value`    | the result of a call                          | 1,497     | `tests.PrintCurrentTest(t)` 461, `tests.PrepareTestEnv(t)` 325                |
| 3   | `function-value`    | a package variable                            | 244       | `globalVars` 61, `GlobalVars` 27, `templates.PageRenderer` 13                 |
| 4   | `function-value`    | a struct field                                | 214       | `LoadedTemplates().BodyTemplates.ExecuteTemplate` 12, `r.CollationEquals` 11  |
| 5   | `function-value`    | a parameter                                   | 191       | `linkFormatter` 27, `f` 19, `fn` 13                                           |
| 6   | `no-implementation` | `cache.StringCache`                           | 42        | `cache.GetCache().Get` 7, `first.Get` 4, `first.IsExist` 4                    |
| 7   | `no-implementation` | `reqctx.RequestContext`                       | 19        | `ctx.SetContextValue` 6, `ctx.GetData` 3, `rc.GetData` 3                      |
| 8   | `other`             | a slice element                               | 12        | `callback[0]` 11, `handlerProviders[len(handlerProviders)-1]` 1               |
| 9   | `other`             | a dereferenced pointer                        | 2         | `(*oldCloseFunc)` 1, `(*fn)` 1                                                |
| 10  | `no-implementation` | `gtprof.mutableContext`                       | 2         | `ctx.SetContextValue` 2                                                       |
| 11  | `other`             | a map value with a constant key               | 1         | `registeredConfigs[NoType]` 1                                                 |
| 12  | `dynamic-key`       | a map value with a key that is not a constant | 1         | `globalVars().systemUserNewFuncs[id]` 1                                       |

Without tests:

| #   | Open-end reason     | Detail                                        | Open ends | Most common expressions                                            |
| --- | ------------------- | --------------------------------------------- | --------- | ------------------------------------------------------------------ |
| 1   | `function-value`    | a local variable                              | 586       | `cancel` 46, `finished` 28, `jobLink` 23                           |
| 2   | `function-value`    | a package variable                            | 208       | `globalVars` 54, `GlobalVars` 16, `SendAsync` 10                   |
| 3   | `function-value`    | a parameter                                   | 154       | `linkFormatter` 27, `f` 17, `fn` 12                                |
| 4   | `function-value`    | a struct field                                | 134       | `LoadedTemplates().BodyTemplates.ExecuteTemplate` 9, `a.initDB` 8  |
| 5   | `no-implementation` | `context.ResponseWriter`                      | 95        | `ctx.Resp.Header` 87, `b.Resp.Header` 5, `resp.Header` 3           |
| 6   | `no-implementation` | `cache.StringCache`                           | 21        | `ctx.Cache.IsExist` 4, `cache.GetCache().Get` 3                    |
| 7   | `no-implementation` | `reqctx.RequestContext`                       | 14        | `ctx.SetContextValue` 4, `ctx.GetData` 3                           |
| 8   | `function-value`    | the result of a call                          | 13        | `routing.RecordFuncInfo(req.Context(),funcInfo)` 3                 |
| 9   | `other`             | a dereferenced pointer                        | 2         | `(*oldCloseFunc)` 1, `(*fn)` 1                                     |
| 10  | `no-implementation` | `gtprof.mutableContext`                       | 2         | `ctx.SetContextValue` 2                                            |
| 11  | `other`             | a slice element                               | 1         | `handlerProviders[len(handlerProviders)-1]` 1                      |
| 12  | `other`             | a map value with a constant key               | 1         | `registeredConfigs[NoType]` 1                                      |
| 13  | `dynamic-key`       | a map value with a key that is not a constant | 1         | `globalVars().systemUserNewFuncs[id]` 1                            |

The probe also counts the library calls through an interface. A call on a repo interface that only a library type implements:

```sh
awk -F'\t' '$1 == "IFACE" && $2 == "library-implementation" && $3 ~ /^db\.(Engine|EngineMigration|Session)$/' with-tests.tsv | wc -l
```

A call on a library interface, by interface:

```sh
awk -F'\t' '$1 == "IFACE" && $2 == "library-interface" {print $3}' with-tests.tsv | sort | uniq -c | sort -rn | head -3
```

## Findings

- **The tests add function values.** `defer tests.PrintCurrentTest(t)()` and `defer tests.PrepareTestEnv(t)()` call the cleanup function that a helper returns. They make 786 open ends, 461 and 325 in the row of "the result of a call". A test that calls a closure in a local variable, such as `test` in `cmd/main_test.go`, makes 337 more. So the rate falls from 97.6% to 93.9% with the tests.
- **The database layer is a repo interface with only library implementations.** `models/db/engine.go:105` declares that `*xorm.Engine` and `*xorm.Session` implement `db.Engine`, `db.Session` and `db.EngineMigration`. No type in scope implements them. The owner decided on 2026-10-26 that such a call is a library call, and ADR-0028 records the rule. So 2,138 calls with tests and 1,920 without are library calls now, and the rate does not count them. The probe gives these counts with the first `awk` command of the library calls. They hold the aliases `base.EngineMigration` and `base.Session` of `modelmigration/base/db.go`, because the probe names the interface that an alias stands for.
- **The rest of `no-implementation` takes its methods from an embedded interface.** `stringCache` implements `cache.StringCache`, but it takes `Get`, `Delete`, `IsExist` and `Ping` from the `backend` interface that it embeds. The type that implements `reqctx.RequestContext` takes its methods from `context.Context` and `RequestDataStore` in the same way. The extractor does not know the code that runs, so these calls stay open ends. Without the tests, `*Response` in `services/context/response.go` is the only implementation of `context.ResponseWriter`. It takes `Header` from the `http.ResponseWriter` that it embeds. So 95 calls stay open ends. With the tests, the mock in `services/context/access_log_test.go` implements the interface too, and these calls are one-of groups.
- **A type parameter with a function type as its constraint is a function value.** `compression` was `other` in the second measurement. It is a `function-value` from a parameter now, as ADR-0028 says.
- **A call through a library interface is the largest group of library calls.** `xorm.io/builder.Cond` gives 424 of them, `error` 418 and `context.Context` 182, with the tests. The second `awk` command of the library calls gives these counts.
- **`go list` is the cold cost.** The first read of a repo takes about 20 times as long as the next one. In the first read, the go tool compiles the export data of the dependencies. A review on a new machine pays it once.

The probe is `probe.sh` and `probe.patch`, next to this record. The documents of this measurement stay outside the repo.
