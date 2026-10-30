# Ruby local type flow on mastodon, 2026-10-30

This measurement is ticket 12 of spec 6. ADR-0027 decision 7 asks for it. It asks one question: how many calls of an open-source Rails app does each variant of the local type flow tie? The owner chooses one variant from these numbers and from the same probe on a private app. No number of the private app enters this record.

- **The repo:** `mastodon/mastodon` at commit `7be1842a5292464c3d14b12ff581d7c712e0d5c6`, a commit of `main` from 2026-10-30. It is one Rails app.
- **The scope:** the default scope with no tests, as `callmap review` reads it. The document holds 2,078 Ruby files.
- **The tool:** the Ruby extractor at the commit `824d8bf` of the branch `issue/12-ruby-type-flow-probe`. Its checker is `Callmap Ruby rules 5` with ruby 3.2.2. Ripper parsed every file in scope.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads and 30 GB of memory, with Node 22.23.1. Other agents ran on it.

## The variants

The variant comes from the probe switch `CALLMAP_RUBY_TYPE_FLOW`, which is 1 when it is not set. Each variant ties a call on a literal, such as `"x"`, `[]`, `{}`, `:x` or `5`, and a call on `Foo.new`, such as `Foo.new.bar`.

| Variant | What it also ties                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------- |
| 1       | A local variable that each write of the def sets from `Foo.new` or a literal.                           |
| 2       | Variant 1, and an instance variable that one method of the class alone sets in the same way.            |
| 3       | Variant 2, and a value of a finder of a model, such as `Account.find(id)`, in a receiver or a variable. |

The rules of each variant:

- **A local variable** has a known class when every write of it in the def sets the same class. A parameter, a block parameter, a multiple assignment, `for`, `rescue => e` and an operator write other than `||=` make it unknown.
- **An instance variable** has a known class when one method of the class alone writes it, on the same side, and every write there sets the same class. An `attr_writer` or `attr_accessor` of the class makes it unknown.
- **A finder** is `find`, `find_by`, `find_by!`, `find_sole_by`, `sole`, `create`, `create!`, `find_or_create_by`, `find_or_create_by!`, `find_or_initialize_by`, `create_or_find_by` or `create_or_find_by!`. It makes a value of the class when the superclass chain of the class reaches `ActiveRecord::Base` and the repo does not define the finder on the class.
- **`Foo.new`** makes a value of `Foo` when the repo does not define `Foo.new`.

## The result

| Variant | Files | Functions | Resolved calls | Open ends | Rate  |
| ------- | ----- | --------- | -------------- | --------- | ----- |
| 1       | 2,078 | 8,400     | 8,405          | 10,287    | 45.0% |
| 2       | 2,078 | 8,400     | 8,491          | 10,157    | 45.5% |
| 3       | 2,078 | 8,400     | 8,596          | 9,821     | 46.7% |

The rate is the rate that `callmap review` shows. It comes from `resolutionRateOf` in `packages/review/src/rate.ts`, so a one-of group counts as one call and a library call does not count. Two runs gave the same documents byte for byte.

The open ends by reason:

| Open-end reason     | Variant 1 | Variant 2 | Variant 3 |
| ------------------- | --------- | --------- | --------- |
| `missing-module`    | 373       | 373       | 373       |
| `dynamic-key`       | 45        | 45        | 45        |
| `untyped`           | 9,385     | 9,255     | 8,919     |
| `function-value`    | 51        | 51        | 51        |
| `no-implementation` | 119       | 119       | 119       |
| `other`             | 314       | 314       | 314       |

Only `untyped` changes from one variant to the next.

The 3 reads took 8.76 s in all, with a peak memory of 220,304 KB. The 1-minute load average was 23.66.

## The steps to run the probe again

`probe.sh` beside this record runs the extractor of a callmap folder on a Ruby repo, once for each variant. It writes `variant-1.json`, `variant-2.json` and `variant-3.json` to the out folder. Then it prints one line for each variant with the counts above. It needs `node` 22.18 or later, `ruby`, `git` and `tar`. It runs no code of the Ruby repo, and it loads no gem.

Use any local paths:

- `<callmap>` is a callmap checkout that holds this record and the commit `824d8bf`.
- `<probe>` is an empty folder for the extractor of that commit.
- `<repo>` is the Ruby repo, at the commit that you measure.
- `<out>` is the folder for the documents. Keep it outside every repo.

```sh
mkdir <probe>
git -C <callmap> archive 824d8bf | tar -x -C <probe>
(cd <probe> && npm ci --ignore-scripts)
<callmap>/docs/research/2026-10-30-ruby-type-flow-on-mastodon/probe.sh <probe> <repo> <out>
```

The commit `824d8bf` holds the probe switch. A later commit can remove it, so the archive pins the extractor. `--ignore-scripts` skips the build of the CLI, which the probe does not need. A file that Ripper cannot parse gives one line on standard error, and the probe goes on.

For mastodon, first get the commit of this record:

```sh
git init mastodon && cd mastodon
git fetch --depth 1 https://github.com/mastodon/mastodon.git 7be1842a5292464c3d14b12ff581d7c712e0d5c6
git checkout FETCH_HEAD
```

The most common receivers of the `untyped` open ends in one variant:

```sh
node -e "
const document = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const counts = {};
for (const { reason, expression } of document.openEnds)
  if (reason === 'untyped') counts[expression.split(/[.(&]/)[0]] = (counts[expression.split(/[.(&]/)[0]] ?? 0) + 1;
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6));
" <out>/variant-3.json
```

## Findings

- **Each variant adds little.** Variant 2 ties 86 more calls than variant 1, and variant 3 ties 105 more than variant 2. The rate rises by 0.5 and then 1.2 points.
- **A known class also takes calls out of the rate.** From variant 2 to variant 3, the open ends fall by 336 and the resolved calls rise by 105. So 231 calls on a value of a finder are library calls now, such as `update!` on a record. A library call does not count in the rate.
- **Parameters and instance variables stay untyped.** In variant 3, the most common receivers of an `untyped` open end are `object` 838, `account` 416, `@account` 384, `status` 384 and `@status` 294. `object` is the parameter of a serializer. Instance variables give 1,521 of the 8,919 `untyped` open ends.
- **`include Singleton` gives 286 open ends.** `ActivityPub::TagManager.instance.uri_for(...)` is the most common untyped expression that starts with a constant. 7 classes of `app` and `lib` include `Singleton`. No variant ties a call on `Foo.instance`.
- **The rules before this ticket tie less.** A temporary change gave no receiver a known class, so literals, `Foo.new` and local variables stayed untyped. It gave 7,900 resolved calls, 11,002 open ends and a rate of 41.8%. That change is not in the repo. So literals, `Foo.new` and the local variables of variant 1 add 3.2 points.
- **A splat stopped the reader.** `send(*args)` and `include(*modules)` raised a `NoMethodError` in `read.rb` before the commit `824d8bf`. That commit reads a splat argument, and `send(*args)` gives `dynamic-key`.

The documents of this measurement stay outside the repo.
