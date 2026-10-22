# Callmap ships on npm as one bundled package

A user runs `npx @callmap/cli review` in a TypeScript repo and gets the reader page, with no clone of Callmap. `@callmap/cli` is the one package on npm. `rolldown` builds it into `packages/cli/dist/`, and the build bundles every other `@callmap/*` package and `elkjs` into it. Only `typescript` stays a run-time dependency. The owner made decisions 1 to 14 below in the triage of issue 45 on 2026-10-22.

Before this change, every package was private at version `0.0.0`, and every `bin` pointed at a `.ts` file. Node runs a `.ts` file from a clone, but it refuses one under `node_modules` with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. So a copy from npm could not start.

## Decisions

1. **The runtime is Node, with `npx`.** The CLI already runs on Node 22.18. A user who reviews a TypeScript repo then installs no Bun, no Go and no Ruby. Bun is not a requirement.
2. **The name is `@callmap/cli`, under a new `@callmap` npm org.** Another person owns the name `callmap` on npm. The scope keeps the name of the product, and the installed command is still `callmap`.
3. **One published package.** It bundles the internal `@callmap/*` packages, which stay private. A user installs one package, and the internal packages can change their shape with no release of their own.
4. **Go and Ruby stay out.** `callmap review` starts only the TypeScript extractor, because the Go and Ruby extractors emit a reference graph document, and a review cannot read one yet. So the package needs no Go and no Ruby.
5. **The maintainer publishes `0.1.0` by hand, and a tag publishes each later version.** A trusted publisher on npm needs a package that already exists. After the first version, a push of a `v*` tag runs `.github/workflows/release.yml`, and no npm token lives on a machine.
6. **The first version is `0.1.0`.** The triage records no reason. By semver, a version below `1.0.0` tells a user that the command can still change.
7. **The build bundles the page script and style once.** A run from the clone bundles the page with `rolldown` each time. The package holds `dist/page.js` and `dist/page.css`, and the command inlines them. So `rolldown` and the CodeMirror packages are dev dependencies only, and `npx` does not install a bundler on the first run.
8. **The extractor uses its own pinned `typescript`.** The package pins `typescript` at `6.0.3` and does not bundle it, because TypeScript finds its `lib.*.d.ts` files next to `lib/typescript.js` on disk. A pin keeps the call graph the same on every repo, whatever TypeScript the repo installs. The extractor still reads the `tsconfig` of the repo, so its paths and settings apply. ADR-0020 names this TypeScript as the checker on the page.
9. **`rolldown` builds 3 entries into `dist/`.** They are `cli.js`, `layout-worker.js` and `extract-typescript.js`, because the command starts the layout worker as a worker thread and the extractor as a process of its own (ADR-0009, ADR-0016). `rolldown` already bundles the page, so the build adds no tool.
10. **The extractor version comes from the package version in the package.** The base cache keys each entry on the extractor version (README, "Review a branch"). In the package, no extractor source lies next to the command, so a hash of the source would be the same for every release. So the key holds the name and the version of `@callmap/cli` and the version of its `typescript`, and a new release starts with an empty cache. In a clone, the key stays a hash of the extractor source, so a change to the extractor misses the cache with no new version.
11. **The tag job runs a direct `npm publish`.** By default a trusted publisher allows only `npm stage publish`, so the config on npm must allow a direct publish.
12. **The tag job runs in the public repo `spasoye-json/callmap`.** npm makes a provenance statement only from a public repo. ADR-0019 holds the decision on the public repo.
13. **In a clone, `bin` points at `dist/cli.js`.** The root `prepare` script runs `npm run build`, so `npm install` and `npm ci` build `dist/`, and `npm link -w @callmap/cli` gives a working command. A contributor runs `npm run build` after a pull. The tests run the source in `src/`, so they need no build and always see the current code.
14. **A smoke test checks the packed package.** `npm run test:pack` packs `@callmap/cli`, installs the tarball in a fixture repo with git history, and runs `callmap review` from that install. It also checks that the tarball holds only the manifest, the README, the LICENSE and the files in `dist/`. The `packed cli` job of the CI runs it on each pull request, and the tag job runs it before it publishes, so a broken package does not reach npm. It stays out of `npm test`, because it needs a build and a network.

## How the package finds its files

The command reads 4 things from disk: the extractor, the layout worker, the page script and the page style. `src/clone-assets.ts` finds them in a clone: the extractor source through its package export, the worker as `layout-worker.ts`, and the page through `rolldown` at each run. `src/package-assets.ts` finds them next to itself in `dist/`, as `.js` and `.css` files. The build swaps the first module for the second, so `dist/` never imports `rolldown` and the tests never need a build. Both modules export the same names, and the build fails if one is missing.

## Why `elkjs` is bundled

The brief named `elkjs` as an example of an external dependency. The build bundles it.

- The page script holds `elkjs` already, so the package carries it in `dist/page.js` either way.
- A prototype build put `elk.bundled.js` in the ESM layout worker, and a layout ran with no change to `page/layout.ts`. The page from the package was byte-identical to the page from the clone.
- The `elkjs` package is 7.7 MB on disk. The bundled copy in `dist/layout-worker.js` is 2.5 MB, and the tarball compresses it.
- One rule stays simple: everything except `typescript` is bundled.

## Consequences

- The tarball holds `package.json`, the README, the LICENSE and the files of `dist/`. The build copies the README and the LICENSE from the repo root into `packages/cli/`, and git ignores the copies.
- `@callmap/cli` lists only `typescript` in `dependencies`. The internal packages, `rolldown`, `elkjs` and the CodeMirror packages are dev dependencies, so an install from the tarball never asks npm for a private package.
- A linked command in a clone runs `dist/`, so its cache key is the package version. A contributor who changes the extractor and runs `npm run build` gets the old cache entries. `--no-cache` reads the base again.
- The bundled files do not carry the license notices of `elkjs` and of the CodeMirror packages. The reader page has had the same gap since ADR-0013. `elkjs` keeps its EPL-2.0 license.
- The maintainer does 4 steps on npm: create the `@callmap` org, publish `0.1.0` from a clean build of the public `master`, add the trusted publisher for `release.yml` with a direct publish allowed, and push the next tag within 48 hours, because a config with no publish expires.
