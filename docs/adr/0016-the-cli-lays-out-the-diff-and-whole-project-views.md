# The CLI lays out the Diff view and the Whole project view

> Superseded in part by ADR-0017. The Whole project view shows one level at a time. The CLI lays out only its top level, and the page lays out the other levels.

The `callmap review` command lays out the Diff view and the Whole project view in Node, and writes the places into the page data as `placements`. The page draws these 2 views from the places and does not call ELK for them. The Folder view and the Route view still lay out in the page, on demand, because they are small and there are many of them. A next hop or a search that opens more functions in the Diff view lays out the view again in the page.

This supersedes the decision of ADR-0013 and spec 24 that the layout runs in the page, for these 2 views only. ADR-0013 expected a layout of less than 0.7 s in the browser. On a review of a private app with 301 functions, a profile in Chromium showed the cost (issue 35):

- The Whole project tab took about 1.4 s, and ELK took about 1.3 s of it in one call on the main thread. The page froze for that time.
- The first load with the Diff view took about 2.2 s. The Diff layout took about 1 s of it.

Spec 24 asks for less than 1 s for each view.

ELK also runs with `elk.layered.thoroughness` at 3, not the default 7. On the Whole project graph of the same review in Node, the layout time went from 1.95 s to 0.89 s, and the crossings went from 629 to 590.

## How the CLI lays out

- `page/layout.ts` is the one layout module. `placementOf(scene)` runs ELK and gives a `Placement`: the place of each frame, box and line, in the order of the scene. `laidOf(scene, placement)` joins the scene and the places. The page and the CLI use the same ELK options.
- A view with `laidOutByCommand` gets a placement. The CLI builds the scene of the view with the same code as the page, so the places match the scene that the page builds.
- Each view lays out in its own worker thread, `src/layout-worker.ts`, so the 2 layouts and the page bundle run at the same time. With the 2 layouts one after the other on the main thread, the command took 8.62 s on the same review.

## Numbers

A manual check on the review of a private app with 301 functions, on 2026-10-19. Each number is the median of 3 runs. The page times are from 3 fresh contexts of headless Chromium.

| Measure                                     | Before       | After        |
| ------------------------------------------- | ------------ | ------------ |
| The command                                 | 6.03 s       | 7.03 s       |
| The first load, to `aria-busy="false"`      | 1,865 ms     | 427 ms       |
| The Whole project tab                       | 1,285 ms     | 121 ms       |
| The page size                               | 2,577,881 B  | 2,654,981 B  |

## Consequences

- The cost moves to the command. The command takes about 1 s more on a private app.
- The page still inlines `elkjs`, because the Folder view, the Route view, a next hop and a search lay out in the page. The page creates ELK only for its first layout.
- The same commits still give a byte-identical page, because the input to ELK is in a fixed order.
- A DOM test moves the places in the page data and checks that the page draws the Diff view and the Whole project view at the moved places. So the page does not call ELK for them.
- A new view that is large and has one scene, with no choice, can set `laidOutByCommand`.
