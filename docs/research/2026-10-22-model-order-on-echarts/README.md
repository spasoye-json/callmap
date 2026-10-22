# The model order NONE on the levels of Apache ECharts, 2026-10-22

This check is for issue 44. It opens every level of the Whole project view of Apache ECharts. It does this once with `master` and once with the model order `NONE`. With `NONE`, 545 of 546 levels wait less than 200 ms from the click on their box to their drawing. `src/chart` waits 224 ms, so the check fails.

## The method

- **The versions:** "before" is `master` at `4d45490`. "After" is the same commit with the change of issue 44. A worktree of `master` and the branch wrote the 2 pages on the same day, one after the other.
- **The review:** the same as `docs/research/2026-10-19-levels-on-a-large-codebase/`. The branch `master` of `apache/echarts` at commit `34f4d927` against the base `b014e953`. The command ran with `--scope 'src/**'`, `--tsconfig tsconfig.json` and `--no-cache`, after `npm ci --ignore-scripts`.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads and Node 22.23.1. The browser is headless Chrome for Testing 154 at 1600 by 1000 pixels.
- **The repeats:** 3 page loads of each page, each in a fresh browser context. The loads of "before" and "after" ran in turn. Each number is the median of the 3 loads.
- **The levels:** a script in the page clicks each folder box and each file box that is not an outside box. After each level, it clicks "Up one level". It opens all 546 levels on each page load: 74 folders and 472 files.
- **The wait:** the time from the click on a box to the next animation frame. That frame comes after `#graph` gets `aria-busy="false"`. It holds the scene of the level, the ELK layout and the drawing.
- **The layout:** the duration of the `performance.measure` of the level. It holds the ELK layout only.
- **The top level in the page:** the command lays out the top level, so the Whole project tab draws it from the page data. A copy of each page has no places for the Whole project view. So that copy lays out the top level in the page.

The 1-minute load average was 2.09 to 3.77 during the page loads.

## The result

| Measure                                     | Before   | After    |
| ------------------------------------------- | -------- | -------- |
| The levels that wait 200 ms or more         | 6 of 546 | 1 of 546 |
| The levels that lay out in 200 ms or more   | 5 of 546 | 0 of 546 |
| The slowest wait, `src/chart`               | 768 ms   | 224 ms   |
| The median wait of a folder level           | 36.5 ms  | 34.8 ms  |
| The median wait of a file level             | 26.1 ms  | 25.8 ms  |
| The median layout of a folder level         | 14.3 ms  | 13.4 ms  |
| The median layout of a file level           | 6.2 ms   | 5.9 ms   |
| The Whole project tab                       | 30.0 ms  | 30.2 ms  |
| The top level in the page, with no places   | 324 ms   | 225 ms   |

The slowest levels:

| Level                    | Boxes | Lines | Wait before | Wait after | Layout before | Layout after |
| ------------------------ | ----- | ----- | ----------- | ---------- | ------------- | ------------ |
| `src/chart`              | 39    | 264   | 768 ms      | 224 ms     | 714 ms        | 163 ms       |
| `src/data/SeriesData.ts` | 108   | 287   | 575 ms      | 163 ms     | 536 ms        | 126 ms       |
| `src/component`          | 37    | 182   | 352 ms      | 135 ms     | 299 ms        | 83 ms        |
| `src/coord`              | 33    | 198   | 343 ms      | 161 ms     | 300 ms        | 121 ms       |
| `src/core/echarts.ts`    | 164   | 248   | 337 ms      | 128 ms     | 306 ms        | 95 ms        |
| `src/util`               | 40    | 126   | 217 ms      | 105 ms     | 180 ms        | 63 ms        |
| `src/animation`          | 13    | 25    | 139 ms      | 142 ms     | 115 ms        | 117 ms       |

`src/animation` is the first level of each page load. Most of its time is the start of ELK.

## Why `src/chart` still waits more than 200 ms

The 3 waits of `src/chart` after the change are 219 ms, 224 ms and 226 ms. The ELK layout takes 160 ms to 167 ms of each. The other 57 ms to 61 ms is the page work around the layout. A CPU profile of one click on `src/chart` gives 44 ms in `sceneOf`. This function builds the scene of the level. The profiler makes each part slower, so this number is an upper limit.

So the model order alone does not bring `src/chart` under 200 ms. The page work around the layout takes about 60 ms on this level. So its layout must take less than about 140 ms.

## Other findings

- **The Diff view does not change.** On the review fixture and on the levels fixture, the Diff view keeps its places.
- **ELK fails on a frame with `NODES_AND_EDGES`.** A first try put the model order on each frame too. ELK then stopped on the Diff view with "Cannot read properties of undefined (reading 'a')". So the model order sits on the root only. A frame takes the ELK default, which is `NONE`.
- **The drawing is looser.** The probe of issue 44 laid out `src/chart` in Node with each model order. With `NONE`, the lines are 16% longer and the drawing is 11% wider. The crossings are 3% more.
- **The command time does not change.** The command took 6.97 s before and 6.86 s after. Each number is from one run.

The pages, the data and the scripts of this check stay outside the repo.
