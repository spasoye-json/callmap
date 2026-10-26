# A Go interface that only a library type implements gives a library call

A call through an interface of the repo that no type in scope implements is a library call when a loaded library type implements the interface. The owner decided this on 2026-10-26, after the measurement on gitea. The code review of spec 74 also found places where the Go extractor did not follow the spec. This record holds the decision, the rules of the match that it needs, and the rules that follow the spec text.

This changes in part decision 2 of ADR-0024. That decision made every such call an open end with `no-implementation`.

## Decisions

1. **A repo interface that only a library type implements gives a library call.** A loaded library type is a type of a loaded package, or of a package that it imports, in a file that is not in scope. A type in scope that takes the called method from a library type that it embeds counts too. An interface that no loaded type implements stays `no-implementation`. So does an interface whose only implementation takes the called method from an interface that it embeds, because the code that runs is not known.
2. **A method matches by the types of its parameters and results, not by their names.** So `Read(p []byte) (int, error)` implements `io.Reader`, whose results have names. The match compares a named type by its package path and its name, because the test variant of a package and its plain variant declare 2 copies of each type.
3. **A generic type is in a group when one type argument for each of its type parameters makes its methods implement the interface.** `go/types` checks an instantiated type, but the extractor has no type arguments to try. So each type parameter of the receiver takes the type that it first meets in a method, and must match that type in the other methods. `Box[T]` with `Put(T)` and `Get() T` implements `Store { Put(int); Get() int }`, and `Label[T]` with `Put(T)` and `Get() string` does not. The extractor does not check the constraints of the type parameters.

## Rules that follow the spec text

- **The interface of the receiver decides.** A call `r.Read()` on a repo interface `RC { io.Reader; Done() }` is a one-of group over the types in scope that implement `RC`, although `io.Reader` declares `Read`. Only a call on a library interface is a library call. An interface with no name belongs to the repo when a file in scope declares one of its methods.
- **A callee with an invalid type is `missing-module` only when code that does not load gave it that type.** That code is an import that does not resolve, or a name that no loaded file declares, such as a missing mock. The extractor follows a variable, a field, a parameter or a function result back to the expression that gave it its type. So `charge()` with the parameter `charge gen.Charge` gives `missing-module`. A callee or a receiver whose type a local type error lost, such as `total := 1 + "cents"`, gives `untyped`.
- **Only a field, a variable, a parameter or a call result is a func value.** A type parameter is a func value when each term of its constraint has the same func type, such as `attempt` in `func Retry[F ~func()](attempt F)`. `m["k"]()` is none of them, so it gives `other`. A slice element, such as `callbacks[0]()`, and a pointer that the call dereferences, such as `(*fn)()`, give `other` too.
- **A file that imports `C` enters the document.** The type checker reads the output of cgo in the build cache. Its `//line` directives point back to the file of the repo, so the extractor takes the path, the lines and the source from that file. A call into C is a library call.
- **A module that the go tool refuses does not stop the extractor.** An example is a module that needs a newer go under `GOTOOLCHAIN=local`. Its files stay out of the document, and the other modules load. If the go tool refuses the go.work, each module loads on its own.
- **The extractor removes `-trimpath` from `GOFLAGS`, as it removes `-mod`.** With `-trimpath`, the export data of a module that a `replace` loads from the repo names its files without the path of the repo, and a call into that module becomes a library call.
- **The test variants load only when a test file is in scope.** So `--scope '!**/*_test.go'` type-checks each package once.

## Why

- **A library interface is not a one-of group, and an interface that only the library implements acts like one.** On gitea, `db.Engine` has no implementation in gitea, and the xorm module implements it. Each call on it was an open end with `no-implementation`, although the code that runs is in a library. A library call is not counted in the resolution rate, as a call on `io.Writer` is not.
- **The name of a parameter is not part of a Go type.** `types.Identical` ignores the names too, but it compares the 2 copies of a named type as different types.
- **A generic type has no type arguments at the call site.** A type argument for each type parameter is the narrowest test that keeps `Box[T]` in the group and `Label[T]` out of it.

## Consequences

- The gitea record of `docs/research/2026-10-26-go-resolution-on-gitea/` counts the calls on `db.Engine`, `db.Session` and `db.EngineMigration` as library calls.
