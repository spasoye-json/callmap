# ELK and SVG draw the reader page, not Cytoscape

> Superseded in part by ADR-0016. The CLI lays out the Diff view and the Whole project view, and the page lays out the other views.
>
> Superseded in part by ADR-0017. A view also gives the model order of its ELK layout.

The reader page draws its graph with `elkjs` and SVG. ELK lays out the boxes and the file frames with the `layered` algorithm from left to right. It routes each call with `elk.edgeRouting: ORTHOGONAL` and `hierarchyHandling: INCLUDE_CHILDREN`, so a line turns only at 90 degrees and goes around the boxes. The page draws the boxes, the frames and the bend points of each line as SVG, and has its own pan and zoom. Cytoscape leaves the page and the dependencies.

The page of spec 15 drew each call with Cytoscape as a straight or curved line. On a real review of a private app, the lines crossed boxes and each other, and the owner could not follow one call from its caller to its callee. A prototype at commit `bb840b4` on the branch `prototype/orthogonal-lines` of the archive repo `spasoye-json/callmap-archive` compared 3 methods on the project view of that review, with 375 boxes and 360 calls:

| Variant | Method                                                 | Lines through boxes | Crossings | Layout time |
| ------- | ------------------------------------------------------ | ------------------- | --------- | ----------- |
| A       | Cytoscape, ELK layered layout, taxi edges              | 80                  | 982       | 619 ms      |
| B       | ELK orthogonal routes drawn as SVG, file frames        | 0                   | 770       | 453 ms      |
| C       | B with folder frames and bundled calls between files   | 0                   | 249       | 413 ms      |

Variant A kept Cytoscape and only changed its layout. The `cytoscape-elk` adapter takes only the positions of the boxes from ELK, and Cytoscape draws each taxi edge itself. Those edges still went through 80 boxes. Variants B and C draw the ELK routes as they are, and no line goes through a box. The owner chose B for the Diff view and C for the Whole project view.

The layout runs in the browser, not in the CLI. The prototype laid out the project view in less than 0.7 s in the browser, so a layout at build time gives no gain. The page stays one file, and it lays out a view only when the reader opens it. The input to ELK is in a fixed order, so the same review always gives the same layout.

## Consequences

- A DOM test reads the SVG, not the pixels. It checks that each segment of a line is horizontal or vertical, and that no segment crosses a box that is not its caller or its callee.
- The page draws the marks with CSS classes and the colour tokens of the page, so light mode and dark mode need no redraw.
- A view is a pure function from the page data to frames, boxes and lines. The views share one drawing module and one interaction module.
- The layout is asynchronous. The graph is `aria-busy` while ELK runs, and a test waits for it to end.
- The page inlines the bundled `elkjs`, so the page of the fixture review is about 1.4 MB. It still makes no network request.
- `elkjs` is under the EPL-2.0 or the GPL-3.0, and Cytoscape was under the MIT licence. Each page now carries EPL-2.0 code.
- A next hop lays out the whole view again. The page keeps the clicked box at the same place on the screen, so the reader does not lose it.
