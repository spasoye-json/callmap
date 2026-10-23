# The Whole project view shows one level at a time

> Superseded in part by ADR-0023. The Diff view also lays out with the model order `NONE`.

The Whole project view shows one level of the folder tree at a time, not the whole project in one layout. A level is one folder of the scope or one file. The level of a folder shows its child folders and its files as boxes, and the level of a file shows its functions. A bundled line between 2 boxes stands for the calls from one box to the other, with their count. A call to code outside the open level ends at an outside box. The view opens at the top level, and a click on a box opens its level.

The CLI lays out only the top level. The page lays out each other level the first time that the reader opens it, and keeps that layout. Each layout in the page records a `performance.measure`.

This supersedes the zoom levels of issue 27, and the part of ADR-0016 that lays out the whole project in the CLI. The Diff view keeps the decision of ADR-0016.

## Why

After issue 35, the CLI laid out every function, file frame, folder frame and call of the Whole project view in one ELK run. The size of that layout grows with the repo. On a private app, with 528 nodes in that layout, the owner still found the page slow. A repo with thousands of functions gives a layout that takes too long and a drawing that nobody can read. The zoom levels of issue 27 hid the function boxes at a far zoom, but the page still held and laid out each of them.

The owner chose one level at a time on 2026-10-19, after the profile of issue 35 (spec 37). A level holds only the boxes of one folder or one file, so its size does not grow with the repo. Spec 37 asks for each level of a private app to lay out in less than 200 ms.

The same spec also caches the graph document of the base, so a second review of the same base reads only the branch, and stores the file texts as one gzip block in the page.

## Two rules of a level

The owner confirmed 2 rules of the levels on 2026-10-20, for spec 37.

- A folder with only one file shows as the box of that file. This extends the rule that a chain of folders with one child each shows as one box. The reason is the same: a level never holds a single box.
- A click on an outside box opens the level of that outside code. The outside box is the first folder or file on the path of that code that does not hold the open level, so the click opens that folder or file. The page already did this, and the README already said so.
- An outside box collapses like the box of that path at its parent level, so a click on it opens a level with 2 or more boxes or a file level.

## The model order of a level

Each level of the Whole project view lays out with `elk.layered.considerModelOrder.strategy: NONE`, after issue 44. This holds for the top level that the CLI lays out and for each level that the page lays out. The Diff view, the Folder view and the Route view keep `NODES_AND_EDGES`. The model order sits on the root of the ELK graph only. ELK fails on the Diff view when its frames carry `NODES_AND_EDGES`. A frame with no model order takes the ELK default, `NONE`, and not the model order of the root. A layout of random graphs in elkjs 0.12.0 with `INCLUDE_CHILDREN` shows this. `docs/research/2026-10-22-model-order-on-echarts/` describes that layout.

The reason is the layout time. On ECharts, the ELK phase "Sort By Input Model NODES_AND_EDGES" took 83% of the layout of `src/chart`. With `NONE`, its layout goes from 714 ms to 163 ms in the browser. The cost is a looser drawing. On `src/chart`, the lines are 16% longer and the drawing is 11% wider. The crossings are 3% more. No commit, ADR or note gave a reason for `NODES_AND_EDGES`. It came with the first ELK drawing in `aa80287`.

The model order is a field of the `Scene`, not a flag of the `View` like `laidOutByCommand`. The reason is that the scene is the one object that `placementOf` gets. The CLI sends only the scene to its layout worker. A flag on the `View` would need a second argument on `placementOf` and on the layout worker. This changes ADR-0013. ADR-0013 says that a view is a pure function from the page data to frames, boxes and lines. A view now also gives the model order of its layout.

## Numbers

The check of `docs/research/2026-10-19-levels-on-a-large-codebase/` ran on 2026-10-19. "Before" is commit `ee2e994`, the end of issue 35. "After" is spec 37 with tickets 38 to 41. These numbers are from before issue 44. Each number is the median of 3 runs, but the level numbers come from one page load. The review of the private app holds 375 functions in scope. The Apache ECharts review holds 3,933 functions in scope.

| Measure                        | Private app before  | Private app after  | ECharts before | ECharts after |
| ------------------------------ | ------------------- | ------------------ | -------------- | ------------- |
| The command, without the cache | 2.94 s              | 2.68 s             | 22.32 s        | 6.54 s        |
| The command, with the cache    | none                | 2.53 s             | none           | 5.96 s        |
| The page size                  | 2,654,981 B         | 2,343,992 B        | 10,355,183 B   | 5,983,117 B   |
| The first load                 | 123 ms              | 110 ms             | 251 ms         | 160 ms        |
| The Whole project tab          | 59 ms               | 37 ms              | 220 ms         | 93 ms         |
| The slowest level              | none                | 70 ms              | none           | 804 ms        |
| The levels at 200 ms or more   | none                | 0 of 117           | none           | 6 of 546      |

The check of `docs/research/2026-10-22-model-order-on-echarts/` ran on 2026-10-22 for issue 44. It opened each level of ECharts with the model order `NODES_AND_EDGES` and with `NONE`. Each number is the median of 3 page loads. "The wait" is the time from the click on a box to its drawing. "The layout" is the ELK layout only, as in the table above. The 2 checks used different pages on different days. So the layout of `src/chart` before issue 44 is 804 ms in the first check and 714 ms in the second.

| Measure                                   | ECharts before issue 44 | ECharts after issue 44 |
| ----------------------------------------- | ------------------ | ----------------- |
| The slowest layout, `src/chart`           | 714 ms             | 163 ms            |
| The slowest wait, `src/chart`             | 768 ms             | 224 ms            |
| The levels that lay out in 200 ms or more | 5 of 546           | 0 of 546          |
| The levels that wait 200 ms or more       | 6 of 546           | 1 of 546          |

## Consequences

- On a private app, each level lays out in less than 200 ms. The slowest level is the first layout of a page load, and most of its time is the start of ELK.
- In the check of 2026-10-19, before issue 44, 6 levels of 546 on ECharts took 200 ms or more. The slowest was `src/chart`, with 39 boxes and 264 lines, at 804 ms. The layout time follows the lines of a level, not the size of the repo. A folder with many child folders that call each other is the worst case.
- The command no longer lays out every function of the scope. On ECharts it takes 6.54 s in place of 22.32 s.
- The cache saves one read of the base. The command reads the branch and the base at the same time, so the cache saves more CPU time than wall time. On a private app, the CPU time goes from 11.22 s to 6.99 s, and the wall time goes from 2.68 s to 2.53 s.
- The page holds no layout of the whole project, and its texts are compressed. On ECharts the page is 42% smaller. The branch graph is now the largest part of the page data, 2,754,067 B of 4,122,815 B on ECharts.
- The page draws only the boxes and the lines of one level, so pan and zoom stay fast on a large repo. The zoom levels leave the view.
- A click on a level that the page did not lay out yet waits for ELK. The page keeps each layout, so a second visit to a level does not wait.
- After issue 44, no level of ECharts lays out in 200 ms or more. But `src/chart` still waits 224 ms from the click on its box to its drawing. The scene and the drawing add about 60 ms to its layout of 163 ms. The check is `docs/research/2026-10-22-model-order-on-echarts/`. The other 545 levels wait less than 200 ms.
- A repo with denser levels than ECharts can still take more than 200 ms. The layout time follows the lines of a level, and the model order `NONE` makes each line cheaper, not fewer.
- The levels do not change the Diff view. On ECharts, a review of 50 commits gives a Diff view of 2,584 boxes and 6,356 lines, and the command did not end in 10 minutes. ADR-0023 adds the Diff limit for this case.
