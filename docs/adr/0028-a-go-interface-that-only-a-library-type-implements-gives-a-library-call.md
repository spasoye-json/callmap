# A Go interface that only a library type implements gives a library call

Sometimes no type in scope implements an interface of the repo. A call through that interface is a library call when a loaded library type implements the interface. The owner decided this on 2026-10-26, after the measurement on gitea. The owner made decisions 4 and 5 on 2026-10-27, after the second code review of spec 74. The code review of spec 74 also found places where the Go extractor did not follow the spec. This record holds the decisions, the rules of the match that it needs, and the rules that follow the spec text.

This changes in part decision 2 of ADR-0024. That decision made every such call an open end with `no-implementation`.

## Decisions

1. **A repo interface that only a library type implements gives a library call.** A loaded library type is a type of a loaded package, or of a package that it imports, in a file that is not in scope. A type in scope that takes the called method from a library type that it embeds counts too. An interface that no loaded type implements stays `no-implementation`. So does an interface whose only implementation takes the called method from an interface that it embeds, because the code that runs is not known.
2. **A method matches by the types of its parameters and results, not by their names.** So `Read(p []byte) (int, error)` implements `io.Reader`, whose results have names. The match compares a named type by its package path and its name, because the test variant of a package and its plain variant declare 2 copies of each type.
3. **A generic type is in a group when one type argument for each of its type parameters makes its methods implement the interface.** `go/types` checks an instantiated type, but the extractor has no type arguments to try. So each type parameter of the receiver takes the type that it first meets in a method, and must match that type in the other methods. `Box[T]` with `Put(T)` and `Get() T` implements `Store { Put(int); Get() int }`, and `Label[T]` with `Put(T)` and `Get() string` does not. The extractor does not check the constraints of the type parameters.
4. **A module that the root `go.work` does not use loads on its own.** The extractor loads it with `GOWORK=off`, from its own folder, so each Go file in scope enters the document. The modules on the use lines still load once, as the workspace.
5. **A one-of group holds only the methods that a file in scope declares.** A type in scope that takes the called method from a library type that it embeds stays out of the group, because that method is a library method. An example is `buf struct{ *strings.Builder }` for `WriteString`.

## Rules that follow the spec text

- **The interface of the receiver decides.** A call `r.Read()` on a repo interface `RC { io.Reader; Done() }` is a one-of group over the types in scope that implement `RC`, although `io.Reader` declares `Read`. Only a call on a library interface is a library call. An interface with no name belongs to the repo when a file in scope declares one of its methods.
- **A callee with an invalid type is `missing-module` only when code that does not load gave it that type.** That code is an import that does not resolve, or a name that no loaded file declares, such as a missing mock. The extractor follows a variable, a field, a parameter, a function result or the name of a type switch back to the expression that gave it its type, and it follows both sides of an operator such as `+`. So `charge()` with the parameter `charge gen.Charge` gives `missing-module`. A callee or a receiver whose type a local type error lost, such as `total := 1 + "cents"`, gives `untyped`.
- **Only a field, a variable, a parameter or a call result is a func value.** A type parameter is a func value when each term of its constraint has the same func type, such as `attempt` in `func Retry[F ~func()](attempt F)`. `m["k"]()` is none of them, so it gives `other`. A slice element, such as `callbacks[0]()`, and a pointer that the call dereferences, such as `(*fn)()`, give `other` too.
- **A file that imports `C` enters the document.** The type checker reads the output of cgo in the build cache. Its `//line` directives point back to the file of the repo, so the extractor takes the path, the lines and the source from that file. cgo rewrites a call into C with a pointer on the same line, so the columns after it do not point into that file. So the extractor parses the file of the repo again, and pairs each function and each call with the one that the type checker read, by the line and the text of the callee. A call into C is a library call. A call that cgo adds is not in the document.
- **A module that the go tool refuses does not stop the extractor.** An example is a module that needs a newer go under `GOTOOLCHAIN=local`. Its files stay out of the document, and the other modules load. If the go tool refuses the go.work, each module loads on its own.
- **The extractor loads the packages of the files in scope, not each whole module.** So `--scope 'services/billing/**'` type-checks only those packages. A type of a package that no package in scope imports is not loaded, so it implements no interface.
- **The extractor removes `-trimpath` from `GOFLAGS`, as it removes `-mod`.** With `-trimpath`, the export data of a module that a `replace` loads from the repo names its files without the path of the repo, and a call into that module becomes a library call. The extractor reads `GOFLAGS` as the go tool does, from the environment or from the go env file of `go env -w`. It always passes the filtered value, also to the build of the extractor.
- **The test variants load only when a test file is in scope.** So `--scope '!**/*_test.go'` type-checks each package once.

## Why

- **A library interface is not a one-of group, and an interface that only the library implements acts like one.** On gitea, `db.Engine` has no implementation in gitea, and the xorm module implements it. Each call on it was an open end with `no-implementation`, although the code that runs is in a library. The resolution rate does not count a library call, as it does not count a call on `io.Writer`.
- **The name of a parameter is not part of a Go type.** `types.Identical` ignores the names too, but it compares the 2 copies of a named type as different types.
- **Story 29 asks for each Go file in scope in the document.** A module that the `go.work` does not use dropped out of the document with no note. Story 30 still holds for the modules on the use lines.
- **The spec puts in a one-of group the method of each type in scope.** A method that a library type declares is library code, so it stays out, as any other library callee does.
- **A generic type has no type arguments at the call site.** A type argument for each type parameter is the narrowest test that keeps `Box[T]` in the group and `Label[T]` out of it.

## Consequences

- The gitea record of `docs/research/2026-10-26-go-resolution-on-gitea/` counts the calls on `db.Engine`, `db.Session` and `db.EngineMigration` as library calls.
