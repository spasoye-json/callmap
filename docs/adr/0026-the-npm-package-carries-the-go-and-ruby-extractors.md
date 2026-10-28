# The npm package carries the Go and Ruby extractors

> Changed in part by ADR-0028. The key of the built binary leaves out the Go test files, and so does the package.

`@callmap/cli` carries the source of the Go extractor and the Ruby script of the Ruby extractor in `dist/`. On the first run in a repo with Go files, the CLI builds the Go extractor with the `go` of the user into the Callmap cache, and later runs reuse the binary. The Go source holds a vendored copy of `golang.org/x/tools`, so the build needs no network. The Ruby extractor runs its script with the `ruby` of the user. The owner made these decisions in a grilling on 2026-10-23 and 2026-10-24.

This supersedes decision 4 of ADR-0021, "Go and Ruby stay out", and the rule of ADR-0021 that everything except `typescript` is bundled.

## Why

- **A Go user has `go` already.** A prebuilt binary for each platform would make the package large and need a release build for each platform. A build on the first run takes the `go` that the user already has.
- **The checker follows the build.** The Go checker is the version of the `go` that built the extractor, as ADR-0024 says. A prebuilt binary would name the go of the release machine, not a tool that the user has.
- **`x/tools` is vendored.** The extractor must not use the network (ADR-0024). A build that fetches `x/tools` on the first run would break that rule.
- **The vendored source sits under `dist/`.** `packages/scope/src/skipped.ts` skips any `vendor` folder of a repo under review. The source of the extractor is not such a repo, but the build must copy the vendored modules into `dist/` by hand.

## Consequences

- The key of the built binary holds the package version, a hash of the Go source with its vendored modules, and the output of `go version`. A new `go` builds the extractor again.
- If `go` is not on the `PATH`, the CLI skips the Go files and prints one line. If `ruby` is not on the `PATH`, it does the same for Ruby.
- The tarball check of decision 14 of ADR-0021 also lists the Go source, its vendored modules and the Ruby script.
- `dist/THIRD-PARTY-NOTICES.txt` also carries the license of `golang.org/x/tools`.
