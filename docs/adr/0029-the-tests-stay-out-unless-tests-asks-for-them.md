# The tests stay out unless `--tests` asks for them

By default, no walk of Callmap reads a test file, in any language. The flag `--tests` reads them. This covers `callmap review`, its base read and its branch read, and each extractor CLI that runs on its own. The owner decided this in the triage of issue 86 on 2026-10-29.

This changes decision 6 of ADR-0024 and story 25 of spec 74. They made the tests enter by default, so that Go matched TypeScript.

## Decisions

1. **The test globs.** A test file is a repo-relative path that one of these globs matches:
   - `**/*_test.go`
   - `**/*.test.*` and `**/*.spec.*`
   - `**/*_spec.rb` and `**/*_test.rb`
   - `**/__tests__/**`, `**/test/**`, `**/tests/**` and `**/spec/**`
2. **The test globs are `!` scope globs.** The review command adds each of them to the scope of the user, after the globs of the user. A glob that the scope already holds does not repeat. A `!` glob wins over every other glob. So a `--scope` glob of the user does not put a test file back.
3. **The document records the effective scope.** The `scope` field of each graph document holds the test globs once, per ADR-0011. The base cache key reads the effective scope. So a run with `--tests` and a run without it never share a base entry.
4. **The list lives in `@callmap/scope`, as `TEST_GLOBS`.** The globs are file-name rules of each language, but the core stays language-blind in its code. The core guard test still passes.
5. **The Go extractor has a copy of the list.** Its CLI is a Go program, so `testGlobs` in `packages/extractor-go/go/scope.go` copies the list. The CLI test of the Go extractor fails when the 2 copies differ. With no test file in scope, the Go extractor loads no test variant, as ADR-0028 says.
6. **The review command passes the effective scope and `--tests` to each extractor.** The extractor then reads the scope as it is. So only the review command decides about the tests. `extractGo` reads its scope as it is too, like the TypeScript and Ruby extractors as libraries.

## Why

- **The tests hide the change.** On a private Go branch, the review with the tests showed about 4 times as many functions as the review without them. Its resolution rate was lower, and it took more time and more than twice the memory. A test that mocks its calls adds open ends, and the test variants load each package a second time. Per ADR-0024, no number of the private repo enters this record.
- **A user typed a `!` glob for each language at each run.** A default that the user must turn off at each run is the wrong default.
- **One list in the language-blind core.** Each extractor reads a scope through `@callmap/scope`, so the TypeScript and Ruby extractors cannot disagree about a test file.

## Consequences

- **Known risk:** a Go package in a folder named `test` is real code, and the folder rule leaves it out. The same holds for a folder named `tests` or `spec`. `--tests` brings it back.
- There is no flag that chooses the test globs, and no config file for them.
- The page does not mark a test function. A review with `--tests` shows a test function like any other function.
