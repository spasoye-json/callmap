# Ruby ties only the calls that its rules prove

> Changed in part by ADR-0030. A class takes its methods from every body of that class in its load unit, and a constant outside a Rails app ties through the same index.

The Ruby extractor emits a graph document. Ruby has no type checker, so Callmap's own static rules tie the calls: Zeitwerk naming for constants, the class chain for methods, and a local type flow that the first ticket of the Ruby spec chooses. A call that the rules do not prove is an open end, even when only one `def` in the repo has its name. The owner made these decisions in a grilling on 2026-10-23 and 2026-10-24.

This supersedes the plan of ADR-0012 and `docs/product.md` to measure Sorbet-based `scip-ruby` first. It also changes the rule of `docs/product.md` that every call comes from the language's own tools. The rule is now that static rules prove every call, with no guess. For TypeScript and Go, those rules are the type checker.

## Decisions

1. **Proved calls only.** A call ties to a function through a constant receiver, such as `Foo.bar` or `Foo.new` to `initialize`, or through `self` in the class chain, with `include`, `prepend`, `extend` and Rails concerns. `send`, `public_send` and `try` with a literal name tie like a direct call. A computed name gives an open end with `dynamic-key`.
2. **No guess by a unique name.** A call on a value of unknown type is an open end with `untyped`, even when one `def` alone in the repo has its name.
3. **Library calls.** A call that does not tie is a library call when the class chain reaches a class outside the repo, such as `ActionController::Base`. A method that a Rails macro makes, such as `attr_reader`, `delegate`, `scope` or `has_many`, is a library call too. A call on an unknown receiver whose name has no `def` in the repo is a library call.
4. **Missing constants.** A constant that does not resolve gives an open end with `missing-module`.
5. **The parser is Ripper.** Ripper ships with every Ruby, so the extractor needs no gem and no bundle of the app. The checker is "Callmap Ruby rules" with the version of the extractor and of the running Ruby. A file that Ripper cannot parse enters the document with no functions, and the CLI prints its name.
6. **The classic autoloader follows Zeitwerk.** Rails before 6 uses the same file naming. Outside any Rails app, functions and calls on `self` still tie, and a constant that does not resolve is an open end.
7. **The local type flow is measured first.** The first ticket measures 3 variants on `mastodon/mastodon` and on a private app of the owner: `x = Foo.new` only, then also an instance variable that one method of the class alone sets from `Foo.new`, then also a fixed list of ActiveRecord finders that return their model, such as `find`, `find_by` and `create`. That list is a stub of the library, like a `.d.ts` file, and not a guess. The owner then chooses from the numbers. Ruby ships after that ticket, whatever the rate.

## Why

- **A guess looks like a proof on the page.** A unique-name guess would draw a call in the same blue as a call that the rules prove. ADR-0001 says that static analysis owns every call. On a private Rails app, the guess raised the share of tied calls by a lot, and nothing checked if each guess was right.
- **`scip-ruby` needs Sorbet.** The owner's Rails apps hold no Sorbet and no RBS, and their gems do not load reliably outside their own Ruby versions. Rules that read source only work on every app.
- **The rate is low and the page says so.** On a private Rails app, the rules tied about a third of the calls before any type flow. The open ends are values of unknown type: method results, local variables, parameters, instance variables and block parameters. The page shows the rate, so the reader knows how much to trust.

## Bias of the rate

The Ruby rate is more generous than the Go and TypeScript rates. A call on an unknown receiver counts only when a `def` in the repo has its name. A call that does not tie and whose name the repo never defines is a library call, so it counts in neither part of the rate. Go and TypeScript count every call into the repo that they cannot tie.

## Consequences

- At a rate near one third, many methods have no caller in scope, so they show as entry points. The Route view helps less for Ruby than for Go and TypeScript.
- The committed measurement for Ruby runs on `mastodon/mastodon`, in `docs/research/`. No number of the private app enters a committed file.
- `packages/extractor-ruby/src/zeitwerk.ts` must read the inflections of the app, the `lib` autoload and the paths of engines.
- The Ruby spec decides the function id and the name of a method in `class << self`, with `module_function`, and with `define_method` and a literal name.
- The reference graph and `@callmap/reference-graph` go away at the end of the Ruby spec.
