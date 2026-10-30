# Ruby methods come from every body of a class in its load unit

The Ruby spec makes the Ruby extractor emit a graph document, as ADR-0027 plans. This record holds the rules that ADR-0027 left to the spec. The owner made these decisions in a grilling on 2026-10-30.

This changes in part ADR-0027. There, Zeitwerk naming tied a constant to one file. Now Zeitwerk naming decides which constants a Rails app has, and a class takes its methods from every body of that class in its load unit. Outside a Rails app, a constant ties through the same index, and is an open end only when the index does not hold it.

## Decisions

1. **The scope is ADR-0027.** "Full Ruby support" is the Ruby spec of `docs/product.md`: the graph document, the review, the npm package, the record on `mastodon/mastodon` and the end of `@callmap/reference-graph`. ERB views, Sorbet and RBS stay out. No unique-name guess.
2. **The load unit.** A load unit is one Rails app, the folder of one `.gemspec`, or else the rest of the repo. The extractor indexes every `class` and `module` body by its full name in each load unit. A constant ties with the lexical nesting lookup of Ruby, inside its own load unit only.
3. **Reopened classes.** A concern, a monkey patch or a second body of a class adds its methods to the one class. A method of a library class that the repo reopens, such as `String#slugify`, is a function of the repo.
4. **Names.** An instance method is `Order#total`. `def self.x` and `class << self` give `Order.x`. `module_function :x` gives one function, `Mod.x`, and a call through `self` in the module ties to it. `define_method(:x)` with a literal name gives `Order#x` at the line of that call. A `def` in the block of `Point = Struct.new(...)`, `Data.define` or `Class.new(Base)` is a method of `Point`. `Class.new(Base)` puts `Base` in the class chain.
5. **Code outside a `def`.** A call in a block belongs to the `def` around it. A call in a class body, at the top level of a file, in a Rake `task` or in an initializer has no function, so it counts in neither part of the rate. `before_action :x` draws no call, so `x` can show as an entry point.
6. **Receivers with a proved class.** A literal, such as `"x"`, `[]` or `{}`, and `Foo.new` give a receiver of a known class in every variant of the type flow. So `Foo.new.bar` and `"x".slugify` tie.
7. **`super`.** It ties to the `def` of the same name in the next ancestor of the repo. If the chain reaches a library class first, it is a library call.
8. **`self` in a module.** When the module has no `def` of the name, the call is a one-of group over that method in each class of the load unit that includes the module. With no such method, it is an open end with `no-implementation`.
9. **Abstract methods.** A call ties to the first `def` in the class chain, as in TypeScript. A `def` whose only statement is `raise NotImplementedError` is abstract, and a call to it is a one-of group over the overrides in the subclasses of the load unit.
10. **`method_missing`.** A call on `self` that finds no `def` is an open end with `other`, even when the repo defines `method_missing`, because a library ancestor can define the name.
11. **Function values.** `yield`, `block.call`, `callable.()` and `method(:x).call` give an open end with `function-value`. A block that a call site passes is not a call.
12. **No dependency file.** The Ruby rules read only the source of the repo and load no gem. The base cache keys a Ruby entry on the commit, the scope, the extractor version and the output of `ruby --version`.

## Why

- **Zeitwerk naming finds one file, Ruby merges every body.** With one file for each constant, a call to a method from a concern or a reopened class becomes a false open end.
- **One set of names for each load unit.** Ruby keeps one constant for each full name in a process. 2 gems or 2 apps of one monorepo never run in one process, so their constants must not mix.
- **The same shape as TypeScript and Go.** A module and an abstract method play the part of an interface. A concrete method ties to one function, as `this.x()` does in TypeScript.
- **A Gemfile.lock change cannot change the document.** A dependency file would read the base again for no change.
