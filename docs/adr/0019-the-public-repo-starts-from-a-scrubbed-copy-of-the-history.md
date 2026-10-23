# The public repo starts from a scrubbed copy of the history

The checks in ADR-0012, ADR-0013 and ADR-0016 to ADR-0018 ran on a private app. Its name, its file paths and two of its function names were in the docs, in 10 commits, in 8 issues and in 4 pull requests. A force-push cannot remove them all, because GitHub keeps the head of each pull request after the branch changes. So the old repo stays private as `spasoye-json/callmap-archive`, with all its branches, issues and pull requests. The public `spasoye-json/callmap` gets only `master`, rewritten with `git filter-repo`. The name of the private app becomes "a private app", its paths and function names become invented ones, and the numbers of the checks stay.

## Considered options

- **Keep the name.** The docs would show a private app to everyone.
- **Change only the current files.** The history, the issues, the pull requests and their diffs would keep the name.
- **Rewrite this repo and force-push.** The text of 12 issues and pull requests would need manual edits, and only GitHub Support can purge the heads of the pull requests.
- **One squashed commit in the public repo.** The ADRs use the commits as evidence, and a squash loses that trail.

## Consequences

- Every commit has a new SHA. The current files cite the new SHAs. Commits that came before the rewrite still cite the old SHAs, which only the archive holds.
- The public history writes an old issue link as "issue N", not as `#N`, so that GitHub does not link it to a new issue with the same number. The open issues moved to the public repo with new numbers.
- The folders under `docs/research/` that named the private app now end in `-on-a-private-app`.
- The 12 merge commits that GitHub wrote with a personal email now carry the GitHub noreply address.
