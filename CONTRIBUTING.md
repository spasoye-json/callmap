# Contributing to Callmap

Callmap is a call graph reader for an engineer who still reads code. This file tells you how to set up a clone, how to check a change, and how to name a branch and a commit.

## Install

Callmap needs Node 22.18 or later. Install the dependencies from the root of a clone:

```sh
npm install
```

The tests of the Go extractor need `go` on the `PATH`, in the version that `packages/extractor-go/go/go.mod` declares. The tests of the Ruby extractor need `ruby` on the `PATH`. They need no gem.

To try your change on another repo, link the `callmap` command to the clone:

```sh
npm link -w @callmap/cli
```

The linked command runs the build in `packages/cli/dist/`, which `npm install` makes. So run `npm run build` after each change and each `git pull`. `npm unlink -g @callmap/cli` removes it.

## Check a change

Run these checks before you open a pull request:

```sh
npm run lint
npm test
npm run test:browser
```

- `npm run lint` checks the format with Prettier, the types with `tsc` and the code with ESLint. `npm run format` fixes the format.
- `npm test` runs the whole suite with Vitest.
- `npm run test:browser` builds reader pages from the fixture repos and opens them in headless Chromium. It needs a Chromium. The "Checks" part of the README tells where the command finds one. Run it when you change `packages/cli`.
- `npm run screenshots` makes the README screenshots again from the fixture repos, in light mode and in dark mode, and writes them to `docs/screenshots/`. It needs a Chromium too. Run it when you change the look of the reader page.

## The check on a pull request

Each pull request and each push to `master` runs the `lint and test` check in GitHub Actions. The workflow is `.github/workflows/ci.yml`. It runs `npm ci`, `npm run lint` and `npm test` on Node 22, with Go and Ruby installed. It does not run `npm run test:browser`, so run that check on your machine.

The `packed cli` check in the same workflow runs `npm run test:pack`. It packs `@callmap/cli`, installs the tarball in a fixture repo and runs `callmap review` from that install. It fails when the tarball holds a file other than the manifest, the README, the LICENSE and the built files.

## Issues and triage

Open an issue with the bug template or the idea template. Each template has the headings `## Problem`, `## What to do` and `## Acceptance criteria`, and gives the issue the `needs-triage` label. The bug template also gives the `bug` label, and the idea template gives the `enhancement` label. These 2 labels name the kind of issue, and they stay on the issue after the triage. The maintainer changes the triage label to one of these:

| Label             | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `needs-triage`    | The maintainer must read the issue and decide.           |
| `needs-info`      | The issue waits for more information from the reporter.  |
| `ready-for-agent` | The issue is fully specified, and an agent can build it. |
| `ready-for-human` | The issue needs a human decision or human hands.         |
| `wontfix`         | The issue will not be done.                              |

`docs/agents/triage-labels.md` maps these labels for the agent skills.

To report a security problem, do not open an issue. `SECURITY.md` tells you what to do.

## Branches and commits

Name a branch for its issue: `issue/<number>-<slug>`, for example `issue/49-contributing`.

A spec with several tickets uses one integration branch, `spec/<number>-<slug>`, for example `spec/70-open-source-release`. Each ticket branch merges into it, and one pull request merges it into `master`.

Start each commit subject with a prefix for the part that it changes, then one sentence in the present tense:

```
<prefix>: <one sentence in the present tense>
```

The git log uses these prefixes:

- `cli:` for the `callmap` command and the reader page in `packages/cli`.
- `core:` for the core packages, such as `@callmap/review` and `@callmap/graph-document`.
- `extractor:` for an extractor package.
- `docs:` for the README, the ADRs, the glossary and the other records.
- `ci:`, `test:` and `chore:` for the workflow, the shared tests and the repo setup.

For example: `docs: the glossary moves from CONTEXT.md to GLOSSARY.md`.

## Words and decisions

- [GLOSSARY.md](GLOSSARY.md) holds the words of the project. Use its words in code, tests, docs and commits.
- [docs/adr/](docs/adr/) holds the architectural decisions. Read the ADRs of the part that you change. A settled ADR is not rewritten, so a new decision gets a new ADR. A fix to a link or a pointer in a settled ADR is allowed, because it does not change the decision.

## License

Callmap uses the MIT license. See `LICENSE`. A contribution to this repo goes in under the same license.
