# The Diff view has a Diff limit and lays out with the model order NONE

The Diff view draws up to 2,000 lines. This is the Diff limit, `DIFF_LIMIT` in `packages/cli/page/views/diff.ts`. Each line of the Diff view is one call, and a line to an open end counts too. A Diff view with more than 2,000 lines is over the limit. A Diff view with exactly 2,000 lines is not. The Diff view also lays out with the ELK model order `NONE`. The levels of the Whole project view use `NONE` after issue 44. The Folder view and the Route view keep `NODES_AND_EDGES`.

This changes ADR-0016 for a large review. The CLI still lays out the Diff view, but only when its first scene is not over the limit.

## Why

The Diff view puts every function of the review and every marked call into one ELK layout. On a review of 50 commits of Apache ECharts, the Diff view holds 2,021 functions and 6,356 lines. The command did not end in 10 minutes (`docs/research/2026-10-19-levels-on-a-large-codebase/`). The levels of ADR-0017 do not change the Diff view.

The triage of issue 48 timed ELK in Node on synthetic scenes, with 2.5 lines for each box:

| Boxes | Lines | `NODES_AND_EDGES` | `NONE`  |
| ----- | ----- | ----------------- | ------- |
| 800   | 2,000 | 10.97 s           | 7.60 s  |
| 1,600 | 4,000 | 52.31 s           | 14.97 s |

The layout time grows faster than the lines. So a review needs a limit, and `NONE` moves that limit up. The triage of issue 48 set the limit at 2,000 lines. The check below shows that a Diff view just under 2,000 lines ends in less than 15 s.

## Decisions

1. **The limit counts lines.** The CLI and the page count the lines of the scene, before any layout. The layout time follows the lines. The message names them calls, because each line stands for one call.
2. **One constant, carried in the page data.** The CLI writes `DIFF_LIMIT` into the page data as `diffLimit`. The page reads the limit from there, so the CLI and the page use one number. A test sets a low limit with `runReview(invocation, { diffLimit })`, and a DOM test changes `diffLimit` in the page data. No flag or environment variable changes the limit, because issue 48 puts such a flag out of scope.
3. **A view with a limit gives `callLimitOf`.** `overLimitOf` in `packages/cli/page/view.ts` compares the lines of a scene with the limit of its view. The CLI skips the placement of a view over its limit. The page opens on the first view that is not over its limit. So a review over the Diff limit opens on the Whole project view.
4. **The page does not lay out a Diff view over the limit.** A next hop or a search that takes the Diff view over the limit does not call ELK. `interaction.ts` tells the parts with `onOverLimitChange`. The part `diff-limit` then shows the counts and a button. The button opens the Whole project view.
5. **The command prints one line to stderr.** It gives the counts of functions and calls and the limit. The page path still goes to stdout.

## Numbers

The check of `docs/research/2026-10-23-diff-limit-on-echarts/` ran on 2026-10-23. Both reviews compare `34f4d927` of ECharts with the base `34f4d927~50`, with the cache. Each number is the median of 3 runs. The machine was busy, with a load average of 9.9 to 21.3.

| Measure                                       | Before                | After    |
| --------------------------------------------- | --------------------- | -------- |
| The long review, 2,021 functions, 6,356 lines | did not end in 10 min | 8.73 s   |
| The short review, 887 functions, 1,814 lines  | 38.52 s               | 9.67 s   |
| One next hop on the short review, in Chromium | none                  | 5,676 ms |

## Consequences

- A review over the Diff limit no longer stops the command. On ECharts, the review of 50 commits ends in 8.73 s.
- The reader of a large review starts on the Whole project view, and reads the changes level by level. Levels for the Diff view are issue 66.
- A Diff view just under the limit still lays out in the page after a next hop. On the short review, this froze the page for 2.8 s to 6.9 s. A layout in a web worker would keep the page responsive.
- The Diff view draws looser than before, as the levels do after issue 44. The same commits still give a byte-identical page.
- The Diff limit counts lines, not boxes. A Diff view with many functions and few calls lays out even when it holds more than 2,000 boxes.
