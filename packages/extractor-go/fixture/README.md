# The Go fixture repo

A repo the extractor reads, not code this repo ships. Every file is here to make one rule of the
extraction observable, so a reader can tell from the tree what the tests are asserting. It builds
with `go build -mod=mod ./...`, but the extractor never asks it to.

| File                                    | What it holds for the extraction                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `go.mod`                                | The module `example.com/shop`, which is how an import path is mapped to a directory      |
| `cmd/shop/main.go`                      | An aliased import of a package with two files, and an import into the other module       |
| `internal/orders/orders.go`             | One file of the package `main.go` imports, and an import of `money`                      |
| `internal/orders/receipt.go`            | The other file of that package, so one import becomes two edges                          |
| `internal/orders/orders_test.go`        | A test file, which references `money` and is never referenced, since Go never imports it |
| `internal/money/money.go`               | The far end of several imports                                                           |
| `internal/money/testdata/sample.go`     | A file in `testdata`, which the go tool never builds, so it is never claimed             |
| `internal/lonely/lonely.go`             | A file nothing references and that references nothing                                    |
| `billing/go.mod`                        | A second module, `example.com/billing`, nested in the repo                               |
| `billing/invoice/invoice.go`            | The far end of the import that crosses from one module into the other                    |
| `tools/gen/gen.go`                      | A subtree outside `cmd/**` and `internal/**`, so a scope glob has something to leave out |
| `vendor/github.com/acme/retry/retry.go` | A vendored module, which is someone else's code and never claimed                        |

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
