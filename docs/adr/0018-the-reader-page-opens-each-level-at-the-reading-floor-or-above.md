# The reader page takes the new design and opens each level at the reading floor or above

The reader page takes the design "Callmap reader redesign". The owner made it in Claude Design on 2026-10-20. The page opens each view and each level at the zoom of one rule, so its text can be read:

```
openZoom = fitZoom >= 0.92 ? min(fitZoom, 1.25) : 1.0
```

The fit zoom shows the whole level, with a margin of 40 px. 0.92 is the reading floor: the zoom where the smallest text of the graph is 11 px on the screen. A level that fits at the reading floor or above opens whole, up to 125%. A larger level opens at 100% on one anchor box. The anchor is the selected box, else the box with the most changes, else the first box from the left. The anchor sits one third from the left edge of the graph. The level bar at the top of the graph does not count as room for the graph.

The zoom band decides what text the graph draws. Map, below 60%, draws the boxes and the chips, and a tooltip names a box. Scan, from 60% to 92%, draws the names and one count of a level box at 11 px. Scan draws the count badges only on the selected path. Read, from 92%, draws all the text. The lines, the count badges, the "one of" labels, the edge hints and the frame labels keep their screen size. A count badge sits at the middle of the longest straight part of its line. If no part is 32 px long, the badge sits next to the caller.

The page also gets these parts:

- zoom controls and keys in the graph
- an overview map and edge hints on a level larger than the graph
- a legend that hides a mark
- the open ends grouped by file
- the lists of the callers and the callees in the code panel

## Why

The first design opened each view at the fit zoom. On a real review, a dense level shrank to fit the screen until its text could not be read. On the review of this check, the Diff view opened at 16.6%. Its smallest box text was 1.7 px on the screen. The reader had to zoom in before reading anything.

In a large review most boxes are changed or added. The first design filled each marked box with amber or green. So the colour filled the screen, and the selected path did not stand out. The left panel showed a long plain list of open ends. The page had no zoom controls. It had no way to show where the rest of a large level was.

The owner chose the rule, the bands and the order of strength in spec 53 on 2026-10-20. No source records other rules that the owner compared.

- **Names before the whole level.** A reader reads names first. A level that fits only below the reading floor opens at 100% on the part with the most changes. The overview map and the edge hints show where the rest is.
- **125% at most.** A small level does not open larger than its text needs. The first design opened a small level at up to 150%.
- **The selected path is the strongest thing on the screen.** The selected box is the only filled box. The path has blue borders, 2 px blue lines and blue badges. A mark is a chip with a glyph on a neutral box. So a mark does not depend on colour, and a screen full of marks stays calm. Off the path, the boxes and the lines fade to the opacity `--fade`. It is 0.28 in light mode and 0.26 in dark mode.
- **The constraints of ADR-0013 stay.** The page is one HTML file with no network access and system fonts only. ELK lays out the graph, the lines turn only at 90 degrees, and the page follows `prefers-color-scheme`.

## Numbers

The check of `docs/research/2026-10-20-reader-redesign-on-a-private-app/` ran on 2026-10-20. It ran on a review of a private app with 55 changed files in scope. "Old" is `master` at commit `affadd0`. "New" is the branch `spec/53-reader-redesign` at commit `4e1352e`. The repo is private, so the check records numbers only.

| Measure                                   | Old         | New         |
| ----------------------------------------- | ----------- | ----------- |
| The open zoom of the Diff view, 199 boxes | 16.6%       | 100%        |
| Its smallest box text on the screen       | 1.7 px      | 11 px       |
| The open zoom of the densest level        | 48.8%       | 100%        |
| Its smallest box text on the screen       | 5.9 px      | 13 px       |
| The levels that open below 92%, of 120    | 39          | 0           |
| The smallest box text on any level        | 5.0 px      | 11 px       |
| The first load, light mode                | 130 ms      | 160 ms      |
| The first load, dark mode                 | 132 ms      | 154 ms      |
| The page size                             | 2,279,934 B | 2,317,936 B |

Light mode and dark mode gave the same open zoom on every drawing. The check took no screenshot of the private repo. So it did not compare the look of the 2 modes by eye.

## Consequences

- Every level of this review opens with box text of 11 px or more on the screen. The Diff view opens on its part with the most changes. The reader pans or uses the overview map to see the rest.
- The first load is 22 ms to 30 ms slower on this review. The check did not find which part costs the time.
- The mouse wheel and the zoom buttons go from 5% to 150%. The first design let the wheel go to 300%.
- A function box with a chip is 24 px wider, and a level box is 64 px high. Every stored placement changed, and the command writes new places.
- A test checks the classes and the attributes that carry each mark, state and band, not the colours in pixels. The tests of the zoom rule run in a DOM with a graph of a fixed size.
- The keys work only when the focus is in the graph. The arrows pick the call with the smallest vertical distance, so they do not reach every caller or callee. The lists of the code panel reach all of them.
- The Tokens artboard has no hover token. The page adds `--hover` for light and dark mode, so `--selected` stays the selection fill only.
- The design shows the reason of an open end, the TypeScript version and the branch names. The page data does not hold them, so the page does not show them yet.
- The README has no screenshots yet. Issue 50 adds them in the new design.
