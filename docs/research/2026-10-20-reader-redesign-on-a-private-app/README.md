# The reader redesign on a private app, 2026-10-20

This check closes ticket 59. It ran `callmap review` on a review of a private app with 55 changed files, at the old page and at the new page of spec 53. On the old page, the Diff view opened at 16.6% and its smallest box text was 1.7 px on the screen. On the new page, it opens at 100% and its smallest box text is 11 px. The first load is about 25 ms slower.

The app is private, so this record holds numbers only. It names no file, folder or function of the repo.

## The method

- **The versions:** "old" is `master` of callmap at commit `affadd0`, the merge of spec 37. "New" is the branch `spec/53-reader-redesign` at commit `4e1352e`, with tickets 54 to 58. Both versions ran on the same commits of the repo.
- **The review:** `callmap review --base <a commit 8 commits back> --tsconfig <the backend config> --scope '<the backend sources>' --scope '!**/*.spec.ts' --no-open --no-cache --out <file>`, on a copy of the checkout. The branch changes 72 files in the backend sources, and 55 of them are in the scope.
- **The machine:** an Intel Core Ultra 9 185H with 22 threads, Node 22.23.1 and headless Chromium 145 at 1600 by 1000 pixels. Other work ran on the machine. The 1-minute load average was 5.6 to 6.1 during the page runs.
- **The open zoom:** a script reads the scale of the `g.viewport` transform of `#graph` after the view or the level draws. The old page opens each view at the fit zoom, up to 150%. The new page opens at the zoom rule of ADR-0018.
- **The smallest box text:** the smallest font size of the first text of each drawn box, times the scale. It is the size of that text on the screen.
- **The levels:** the script opens every level of the Whole project view on one page load. It clicks each folder box and each file box that is not an outside box, and goes back up with the breadcrumb, as in the check of 2026-10-19.
- **The densest level:** the level with the lowest fit zoom on the old page. The Diff view is the densest drawing of the review.
- **The first load:** the time from the start of the navigation to the first end of `aria-busy="true"` on `#graph`, as in the check of 2026-10-19. Each number is the median of 6 fresh browser contexts, in 2 rounds of 3. The median of 6 runs is the mean of the 2 middle runs, rounded to 1 ms.
- **Light and dark:** the browser context sets `colorScheme` to `light` or `dark`. Every measure ran in both modes.

## The review

The review holds 136 changed functions: 89 added, 39 changed and 8 removed. It also holds 58 neighbours and 5 open ends. The resolution rate is 362 of 374 calls, 96.8%. The Diff view draws 199 boxes, 48 file frames and 213 lines. The Whole project view has 120 levels. The old page is 2,279,934 B, and the new page is 2,317,936 B.

## The open zoom

| Drawing                                  | Old open zoom | Old smallest text | New open zoom | New smallest text |
| ---------------------------------------- | ------------- | ----------------- | ------------- | ----------------- |
| Diff view, 199 boxes, 213 lines          | 16.6%         | 1.7 px            | 100%, Read    | 11 px             |
| Densest level, 17 boxes, 43 lines        | 48.8%         | 5.9 px            | 100%, Read    | 13 px             |
| Second densest level, 28 boxes, 31 lines | 49.5%         | 5.0 px            | 100%, Read    | 11 px             |
| Third densest level, 22 boxes, 39 lines  | 55.3%         | 6.6 px            | 100%, Read    | 12 px             |

Light mode and dark mode gave the same open zoom on the Diff view and on each of the 120 levels.

Over the 120 levels of the Whole project view:

| Measure                              | Old    | New   |
| ------------------------------------ | ------ | ----- |
| The lowest open zoom                 | 48.8%  | 95.5% |
| The highest open zoom                | 150%   | 125%  |
| The levels that open below 92%       | 39     | 0     |
| The levels that open below 60%       | 8      | 0     |
| The levels with box text under 11 px | 39     | 0     |
| The smallest box text on any level   | 5.0 px | 11 px |

The old page opened 51 small levels at its cap of 150%. On the new page, no level of this review needs 100% from the rule. Each level fits at 92% or more, so each level opens whole, at 125% or less. Only the Diff view is larger than the graph. It opens at 100% with the overview map, and its edge hints say "50 more" above, "171 more" to the right and "65 more" below.

## The first load

| Mode  | Old: the 6 runs                 | Old median | New: the 6 runs                 | New median |
| ----- | ------------------------------- | ---------- | ------------------------------- | ---------- |
| Light | 249, 146, 120, 135, 111, 124 ms | 130 ms     | 181, 163, 157, 184, 153, 154 ms | 160 ms     |
| Dark  | 191, 166, 121, 129, 135, 122 ms | 132 ms     | 169, 152, 152, 156, 167, 147 ms | 154 ms     |

The new page is 22 ms to 30 ms slower to the first draw. The new page adds the zoom rule, the overview map, the edge hints and more SVG for each box. The check did not find which part costs the time.

## What this check did not measure

- **The look by eye.** The check took no screenshot of the private repo, so nobody compared the colours of light mode and dark mode on this review. The page tests check the classes and the attributes that carry each mark and state.
- **The cause of the slower first load.** The check did not profile the page.
- **A public repo.** The check ran on one private repo only.

## The result

The old page opened the Diff view of a 55-file review at 16.6%, with box text of 1.7 px, and opened 39 of 120 levels with box text under 11 px. The new page opens the Diff view at 100%, with an overview map and edge hints for the rest, and opens every level with box text of 11 px or more. The first load is 22 ms to 30 ms slower. The page data, the pages and the scripts of this check stay outside the repo.
