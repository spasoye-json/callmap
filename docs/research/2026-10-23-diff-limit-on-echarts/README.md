# The Diff limit on Apache ECharts, 2026-10-23

This check is for issue 48. It times the command on 2 reviews of ECharts, with the Diff limit of 2,000 lines and the model order `NONE` on the Diff view. Both reviews end in less than 15 s, as a median. So the check passes.

## The method

- **The version:** the branch `issue/48-diff-limit` with the change of issue 48, built with `npm run build`. The command ran from `packages/cli/dist/cli.js`. "Before" is `master` at `5205162`, built the same way in a worktree.
- **The repo:** the branch `master` of `apache/echarts` at commit `34f4d927`, after `npm ci --ignore-scripts`. Each review compares it with the base `34f4d927~50`, which is `7985f205`. This base is the review of 50 commits that ADR-0017 names.
- **The long review:** `--scope 'src/**'`. Its Diff view holds 2,021 functions and 6,356 lines. Of these lines, 5,793 are resolved calls and 563 go to open ends.
- **The short review:** `--scope 'src/chart/**' --scope 'src/coord/**' --scope 'src/data/**'`. Its Diff view holds 887 functions and 1,814 lines. A probe of 10 scopes found this one in the range of 1,800 to 2,000 lines that the issue asks for. No base on the first-parent line of `34f4d927` gives that range with `src/**`. The base `34f4d927~10` gives 51 lines, and `34f4d927~20` gives 5,647 lines.
- **The cache:** each review ran once to fill the cache, then 3 times with the cache. Each number is the median of the 3 timed runs. The command ran with `--tsconfig tsconfig.json` and `--no-open`.
- **The next hop:** a script opens the short review in headless Chrome for Testing 145 at 1600 by 1000 pixels. Each of the 3 page loads uses a fresh browser context. It clicks the neighbour box `src/chart/bar/BarView.ts#BarView._enableRealtimeSort`, the first neighbour by id. "The wait" is the time from the click to the next animation frame after `#graph` gets `aria-busy="false"`. "The layout" is the `performance.measure` of the layout.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads, Node 22.23.1 and elkjs 0.12.0.

**The machine was busy.** A game and an Elasticsearch server ran during the check. The 1-minute load average was 9.9 to 21.3. So each number is slower than on an idle machine, and the runs vary more.

## The result

| Measure                        | Before                | After    |
| ------------------------------ | --------------------- | -------- |
| The long review, the command   | did not end in 10 min | 8.73 s   |
| The short review, the command  | 38.52 s               | 9.67 s   |
| The short review, one next hop | none                  | 5,676 ms |

The runs:

| Run | The long review | The short review | The next hop: wait | The next hop: layout |
| --- | --------------- | ---------------- | ------------------ | -------------------- |
| 1   | 6.96 s          | 9.00 s           | 3,076 ms           | 2,764 ms             |
| 2   | 8.73 s          | 21.76 s          | 5,676 ms           | 5,122 ms             |
| 3   | 9.12 s          | 9.67 s           | 7,465 ms           | 6,922 ms             |

The load average after each run:

| Run | The long review | The short review | The next hop |
| --- | --------------- | ---------------- | ------------ |
| 1   | 12.45           | 9.93             | 13.72        |
| 2   | 12.01           | 20.28            | 15.58        |
| 3   | 11.36           | 18.23            | 21.29        |

The 3 runs of the short review on `master` took 48.04 s, 34.51 s and 38.52 s. The load average after them was 21.19, 16.08 and 12.07.

"Before" for the long review comes from `docs/research/2026-10-19-levels-on-a-large-codebase/`. The command did not end in 10 minutes there, and this check did not run it again.

## Other findings

- **The long review prints one line to stderr.** "The Diff view holds 2,021 functions and 6,356 calls, over the Diff limit of 2,000 calls. The page opens on the Whole project view." The command writes no places for the Diff view.
- **The issue counted lines, not resolved calls.** The issue gives 6,356 as the count of calls. That count holds the 563 lines to open ends. An open end is a call that the extractor did not resolve. So the Diff limit counts each line of the Diff view as one call.
- **A next hop near the limit freezes the page.** The next hop added 2 functions and 4 lines, to 889 functions and 1,818 lines. The page laid out the Diff view again on the main thread for 2.8 s to 6.9 s. The wait rose with the load average. A layout in a web worker is out of scope for issue 48.

The pages, the data and the scripts of this check stay outside the repo.
