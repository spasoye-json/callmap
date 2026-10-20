# The levels on a private app and on Apache ECharts, 2026-10-19

This check closes ticket 42. It ran `callmap review` on a private app and on Apache ECharts, to prove spec 37 on real code. On a private app, each level lays out in less than 200 ms. On ECharts, 6 levels of 546 take 200 ms or more.

## The method

- **The versions:** "before" is commit `ee2e994` of callmap, the end of issue 35. "After" is the branch `spec/37-large-codebase` at commit `b565342`, with tickets 38 to 41. Both versions ran on the same commits of each repo.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads, Node 22.23.1 and headless Chrome for Testing 154 at 1600 by 1000 pixels. Other work ran on the machine, so each section gives the 1-minute load average.
- **The repeats:** each number is the median of 3 runs. Each page number comes from 3 fresh browser contexts.
- **The command time:** the wall time from the start of the command to the written page, with `--no-open`. The CPU time is the user time and the system time of the command and its extractor processes.
- **Without the cache:** 3 runs with `--no-cache`, on an empty cache folder in `XDG_CACHE_HOME`. **With the cache:** 1 run fills the cache, then 3 runs read the base from it. The 7 runs of each repo wrote byte-identical pages.
- **The first load:** the time from the start of the navigation to the first end of `aria-busy="true"` on `#graph`. The Diff view draws at that time.
- **The Whole project tab:** the time from a click on the tab to the end of `aria-busy="true"`. After spec 37, the tab draws the top level from the places that the command wrote.
- **The levels:** a script opens every level of the Whole project view on one page load. It clicks each folder box and each file box that is not an outside box, and goes back up with the breadcrumb. The layout time of a level is the duration of its `performance.measure`, `callmap layout: Whole project level:<path>`. It holds the ELK layout only. The first layout of a page load also starts ELK.
- **The top level in the page:** the command lays out the top level, so the page records no measure for it. A copy of the page with no places for the Whole project view makes the page lay it out, and gives its layout time in the browser.

## The private app

The review compares the checkout with a base 60 commits back, with `--tsconfig <the backend config> --scope '<the backend sources>' --scope '!**/*.spec.ts'`, as in the check of ADR-0016. The branch graph holds 375 functions, 360 calls and 12 open ends in 95 files. The review holds 310 functions: 176 added, 57 changed, 19 removed and 58 neighbours.

The load average was 2.05 to 2.96 during the commands, and 1.82 and 2.37 during the page runs.

| Measure                         | Before      | After       |
| ------------------------------- | ----------- | ----------- |
| The command, without the cache  | 2.94 s      | 2.68 s      |
| The command, with the cache     | none        | 2.53 s      |
| The CPU time, without the cache | 13.33 s     | 11.22 s     |
| The CPU time, with the cache    | none        | 6.99 s      |
| The page size                   | 2,654,981 B | 2,343,992 B |
| The first load                  | 123 ms      | 110 ms      |
| The Whole project tab           | 59 ms       | 37 ms       |

The levels after spec 37:

| Measure                                  | Value                     |
| ---------------------------------------- | ------------------------- |
| The levels that the page lays out        | 117: 21 folders, 96 files |
| The slowest level                        | 70 ms                     |
| The slowest level after the first layout | 64 ms, 17 boxes, 43 lines |
| The median level                         | 12 ms                     |
| The levels at 200 ms or more             | 0                         |
| The top level in the page                | 78 ms, 8 boxes, 6 lines   |

The slowest level is the first layout of the page load, a file level with 4 boxes and 1 line. Most of its time is the start of ELK.

## Apache ECharts

The review is the branch `master` of `apache/echarts` at commit `34f4d927`, against the base `b014e953`, the merge of apache/echarts#21621. The 5 commits between them that touch `src` change 7 files. The command ran with `--scope 'src/**'` and the `tsconfig.json` at the root, after `npm ci --ignore-scripts`. The branch graph holds 3,933 functions, 11,804 calls and 922 open ends in 472 files. The review holds 74 functions: 11 changed, 1 added and 62 neighbours.

The load average was 1.37 to 3.51 during the commands, and 2.86 and 3.12 during the page runs.

| Measure                         | Before       | After       |
| ------------------------------- | ------------ | ----------- |
| The command, without the cache  | 22.32 s      | 6.54 s      |
| The command, with the cache     | none         | 5.96 s      |
| The CPU time, without the cache | 47.90 s      | 26.56 s     |
| The CPU time, with the cache    | none         | 14.01 s     |
| The page size                   | 10,355,183 B | 5,983,117 B |
| The first load                  | 251 ms       | 160 ms      |
| The Whole project tab           | 220 ms       | 93 ms       |

The levels after spec 37:

| Measure                           | Value                       |
| --------------------------------- | --------------------------- |
| The levels that the page lays out | 546: 74 folders, 472 files  |
| The slowest level                 | 804 ms, `src/chart`         |
| The median folder level           | 23 ms                       |
| The median file level             | 14 ms                       |
| The levels at 200 ms or more      | 6                           |
| The top level in the page         | 303 ms, 22 boxes, 111 lines |

The 6 levels at 200 ms or more, from one page load:

| Level                    | Layout | Boxes | Lines |
| ------------------------ | ------ | ----- | ----- |
| `src/chart`              | 804 ms | 39    | 264   |
| `src/data/SeriesData.ts` | 559 ms | 108   | 287   |
| `src/coord`              | 340 ms | 33    | 198   |
| `src/core/echarts.ts`    | 336 ms | 164   | 248   |
| `src/component`          | 260 ms | 37    | 182   |
| `src/util`               | 208 ms | 40    | 126   |

The slow levels have many lines for their boxes. `src/chart` holds 39 boxes and 264 lines, because the chart folders call each other and the shared code. The layout time follows the lines of a level, not the size of the repo.

## Other findings

- **A long review on ECharts.** A first try compared the branch with a base 50 commits back, across the merge of apache/echarts#21621. That review holds 2,021 functions, and its Diff view holds 2,584 boxes and 6,356 lines. The command did not end in 10 minutes, and the check stopped it. The levels do not change the Diff view, which the command still lays out as one graph.
- **TypeORM.** A first try on `typeorm/typeorm` stopped with "the one-of group holds calls from more than one call site". A chain of 2 calls through 2 interfaces, such as `a.b().c()`, gives 2 one-of groups with the same key. Its source holds 2,761 functions, so the check moved to ECharts. The branch `fix/one-of-chained-calls` keys each group on the position of the method name, and the extractor then reads all of `packages/typeorm/src` in 3 seconds.

## The result

On a private app, the slowest level took 70 ms, so each level lays out in less than 200 ms. The cache cuts the CPU time of the command by 38%, but the wall time by only 0.15 s, because the command reads the branch and the base at the same time. On ECharts, the command takes 6.54 s in place of 22.32 s, and the page is 42% smaller. 6 of its 546 levels lay out in 200 ms or more. The page data, the pages and the scripts of this check stay outside the repo.
