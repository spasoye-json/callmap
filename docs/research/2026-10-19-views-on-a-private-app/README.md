# The views on a private app, 2026-10-19

This check closes ticket 30. It ran `archmap review` on a real branch of a private app, to prove spec 24 on real code. Each view lays out in less than one second.

## The method

- **The command:** `archmap review --tsconfig <the backend config> --scope '<the backend sources>' --scope '!**/*.spec.ts' --no-open --out <file>`, as in the check of 2026-10-18.
- **The command today:** `callmap review` with the same flags. ADR-0014 renamed the product.
- **The browser:** headless Chromium 155 at 1600 by 1000 pixels, on an Intel Core Ultra 9 185H.
- **The layout time:** the time from the start to the end of `aria-busy="true"` on `#graph`. It holds the scene, the ELK layout and the SVG drawing of the view. A script measures it with a `MutationObserver` on the page.
- **The Diff and Whole project times:** the median of 5 page loads. The first load is the slowest, because the browser compiles the page script.
- **The Folder and Route times:** a click on every folder and on every entry point, on one page load.
- **The crossings:** the count of the segment pairs of two different lines that cross, with the formula of the prototype on `prototype/orthogonal-lines`. The count reads the bend points from the SVG of the Whole project view. The near count is at a zoom that shows the functions. The far count is at the zoom that fits the view, with the bundled lines only.

## Review 1: the branch against its merge base

The review took 2.8 s. The branch changed 2 functions. The branch graph holds 277 functions and 253 calls.

| View          | Drawn                                         | Median  | Slowest |
| ------------- | --------------------------------------------- | ------- | ------- |
| Diff          | 4 boxes, 4 frames, 3 lines                    | 35 ms   | 97 ms   |
| Whole project | 287 boxes, 95 frames, 167 lines               | 281 ms  | 330 ms  |
| Folder        | 22 folders, up to 287 boxes                   | 17 ms   | 264 ms  |
| Route         | 134 entry points, up to 21 boxes and 24 lines | 3 ms    | 19 ms   |

The Whole project view has 97 crossings near and 10 crossings far. No segment is diagonal.

## Review 2: the same branch against a base 60 commits back

The branch has a small change, so a second review with `--base HEAD~60` loads the Diff view more. The review changed 126 functions and drew 158 calls.

| View          | Drawn                             | Median  | Slowest |
| ------------- | --------------------------------- | ------- | ------- |
| Diff          | 182 boxes, 56 frames, 168 lines   | 297 ms  | 359 ms  |
| Whole project | 301 boxes, 95 frames, 206 lines   | 265 ms  | 299 ms  |
| Folder        | 22 folders, up to 301 boxes       | 24 ms   | 302 ms  |
| Route         | 134 entry points, up to 21 boxes  | 3 ms    | 19 ms   |

The Whole project view has 192 crossings near and 0 crossings far. No segment is diagonal. The calls that the branch removed keep their own lines, so this view has more lines and more crossings than review 1.

## The result

The slowest view took 359 ms. No view took 1 second or more. The page data, the pages and the scripts of this check stay outside the repo.
