# The Go extractor resolves each call site with `go/types`

The Go extractor emits a graph document. It loads the packages in scope with `golang.org/x/tools/go/packages`, and `go/types` ties each call site to one function, like the TypeScript extractor does with its type checker. It does not use the call graph of `golang.org/x/tools` (SSA with CHA or VTA). A load error does not stop the extractor. A call into code that does not load becomes an open end. The owner made these decisions in a grilling on 2026-10-23 and 2026-10-24.

This supersedes the plan of ADR-0012 and `docs/product.md` to read Go with the `golang.org/x/tools` call graph. It also changes the cause and the page words of the code `missing-module` of ADR-0020.

## Decisions

1. **One resolver at each call site.** A static call ties to its `*types.Func`. A promoted method ties to the declaration of the embedded type, through `Selection.Obj()`. A call to a generic function ties to its declaration, through `Origin()`.
2. **A call through an interface of the repo is a one-of group.** The group holds the method of each type in scope that implements the interface, with `T` or `*T` as the receiver. A call on a type parameter whose constraint is an interface of the repo is a one-of group too. If no type in scope implements the interface, the call is an open end with `no-implementation`.
3. **A call through a library interface is a library call.** A call on `io.Writer` or `http.Handler` would fan out to every writer and every handler of the repo. A callee whose file is not a file in scope is a library call too. So a call into another module of the repo resolves only when the go tool loads that module from the repo, for example through a `replace` to a local path.
4. **What a function is.** A function declaration and a method declaration are functions, `init` too. The name of a method is `Type.Method`, with no `*` for a pointer receiver. A call inside a func literal belongs to the named function around it, and the func literal is not a function. 2 `init` functions in one file take the suffix `~2`, as in the TypeScript extractor.
5. **Each file is emitted once.** With tests, `go/packages` returns a package twice, as `p` and as `p [p.test]`. Each function comes from the test variant of its own package, so no function shows twice.
6. **Tests enter by default.** `--scope '!**/*_test.go'` leaves them out. A file that a build tag excludes stays out of the document, because `go/types` checks one build. There is no `--tags` option until a review needs one.
7. **The extractor never changes the repo and never uses the network.** It removes any `-mod` from `GOFLAGS`, so the go tool uses its default: readonly, or vendor when `vendor/modules.txt` exists. It sets `GOTOOLCHAIN=local` and `GOPROXY=off`. If `go.work` exists, it loads the workspace once. If not, it loads each `go.mod` in scope on its own.
8. **The checker is the go of the build.** `go/types` is compiled into the extractor, so the checker is `runtime.Version()`, such as Go 1.27.3.

## Open-end reasons in Go

- **`missing-module`** now has the cause "the callee comes from code that does not load: an import that does not resolve, or a file that is missing". The page words change from "module not found" to "code not found", for every language.
- **`function-value`** is a call of a `func` value: a field, a variable, a parameter or the result of a call.
- **`untyped`** is a callee with an invalid type. A method call on `interface{}` does not compile in Go, so `untyped` happens only after a load error that the first code does not cover.
- **`dynamic-key`** is a call of a map value with a key that is not a constant.

## Rules after the review of spec 74

The code review of spec 74 found 5 places where the extractor did not follow the spec. The owner decided the first rule below on 2026-10-26. The other rules follow the spec text.

- **A repo interface that only a library type implements gives a library call.** The owner decided this on 2026-10-26, after the measurement on gitea. There, `db.Engine` of gitea has no implementation in gitea, and the xorm module implements it, so each call on it was an open end with `no-implementation`. A loaded library type is a type of a loaded package, or of a package that it imports, in a file that is not in scope. A type in scope that takes the called method from a library type that it embeds counts too. An interface that no loaded type implements stays `no-implementation`. So does an interface whose only implementation takes the called method from an interface that it embeds, because the code that runs is not known.
- **The interface of the receiver decides.** A call `r.Read()` on a repo interface `RC { io.Reader; Done() }` is a one-of group over the types in scope that implement `RC`, although `io.Reader` declares `Read`. Only a call on a library interface is a library call. An interface with no name belongs to the repo when a file in scope declares one of its methods.
- **A method matches by the types of its parameters and results, not by their names.** So `Read(p []byte) (int, error)` implements `io.Reader`, whose results have names. The match compares a named type by its package path and its name, because the test variant of a package and its plain variant declare 2 copies of each type.
- **A generic type is in a group when one type argument for each of its type parameters makes its methods implement the interface.** `go/types` checks an instantiated type, but the extractor has no type arguments to try. So each type parameter of the receiver takes the type that it first meets in a method, and must match that type in the other methods. `Box[T]` with `Put(T)` and `Get() T` implements `Store { Put(int); Get() int }`, and `Label[T]` with `Put(T)` and `Get() string` does not. The extractor does not check the constraints of the type parameters.
- **A receiver with an invalid type is `missing-module` only when code that does not load caused it.** The cause is an import that does not resolve, or a name that no loaded file declares, such as a missing mock. The extractor follows a variable, a field or a function result back to the expression that gave it its type. A receiver whose type a local type error lost, such as `total := 1 + "cents"`, gives `untyped`.
- **Only a field, a variable, a parameter or a call result is a func value.** `m["k"]()` is none of them, so it gives `other`. A slice element, such as `callbacks[0]()`, and a pointer that the call dereferences, such as `(*fn)()`, give `other` too.

## Why

- **`go/types` and not the SSA call graph.** SSA gives each call site a line that can be synthetic, from a wrapper, a closure or an `init`. CHA fans out every interface call to every type in the program, and VTA needs the whole program to load. A resolver at each call site reads like the TypeScript extractor, and it gives the open-end reasons of ADR-0020 directly.
- **Load errors are allowed.** In a Bazel repo, the generated files, such as `*.pb.go` and `*_mock.go`, are often absent from the working tree. A measurement on a private Bazel repo with these files absent still resolved most calls without tests. With tests, the rate fell a lot, because the mocks were absent. The page shows the drop, and the reader can generate the files to raise the rate. To fail on a load error would make Callmap useless on such a repo.
- **The cause of `missing-module` widens.** A missing `_mock.go` file in the same package is not an import. A new code would change the contract, each extractor and the page words for one repo layout. The wider cause covers it with no new code.
- **A library interface is not a one-of group.** Most calls on `io.Writer` and `context.Context` in a repo go to library types. A group over the types of the repo would be noise.

## Consequences

- The Go extractor needs `go` on the `PATH` and the modules of the repo in the module cache. A module that is not in the cache gives `missing-module`.
- A large repo costs memory: several GB for a repo of about 10,000 Go files. See ADR-0025 for the order of the runs.
- The committed measurement for Go runs on `go-gitea/gitea`, in `docs/research/`. No number of the private repo enters a committed file.
- The reference graph of the Go extractor and `@callmap/reference-graph` go away at the end of the Go spec, if the Ruby extractor no longer needs them.
