# The camera keeps boxes out of the corner, and the map toggle collapses the overview map

The zoom controls and the overview map float over the bottom right of the graph. Together they cover the corner. The camera keeps the anchor box and the selected box out of the corner. The map toggle, the last button of the zoom controls, collapses the overview map and opens it again. The overview map does not move, and it does not fade.

Issue 62 asked 2 open questions:

- Should the camera keep the anchor box and the selected box out of the corner?
- Should the overview map collapse, or move, when a box is under it?

The owner answered both in the triage of issue 62 on 2026-10-22. The camera moves the box, and the reader collapses the overview map with the map toggle. The triage put a move or a fade of the overview map out of scope.

## Decisions

1. **The corner is one rect.** It is the bounding box of the zoom controls and the overview map, as they show at that moment. The camera reads it as a second cover of the graph, next to the level bar at the top (`coverCornerOfGraph` in `packages/cli/page/camera.ts`). `CameraView` carries it, so the edge hints do not query the zoom controls and the overview map themselves. The edge hints read it in the handlers of an apply, before the overview map part shows or hides the overview map for that apply. The old query of the edge hints had the same timing.
2. **The camera moves the box, not the controls.** `open`, `focus` and `keepInView` move the box out of the corner after they place it. The camera takes the shorter move, left or up. It takes a move only if the box stays in view. If neither move keeps the box in view, the camera leaves the box where it is.
3. **The camera measures the corner after an apply.** An apply shows or hides the overview map for the new zoom and the new graph size. So the camera applies first, then measures the corner, then applies again if it moved the box. Before this order, a panel change after a resize measured an old overview map.
4. **The reader collapses the overview map by hand.** The map toggle shows only when the overview map can show. The overview map opens by default, and a reload opens it again. The page does not store the choice. The triage records no reason for the choice of a toggle over a move or a fade.
5. **`ReaderPage` holds the collapsed state, not the overview map part.** The triage asked the overview map part to expose the state. The parts load in the order of their file names, so the handlers of `edge-hints` run before the handlers of `overview-map`. If the overview map part set the state, the edge hints would measure the corner before the overview map collapsed. So `interaction.ts` sets `data-overview-map-collapsed` on `#graph` before it calls any handler. The CSS reads the attribute. The toggle, the camera and the edge hints read one state.

## Consequences

- A first view, a search, a click, a key step and a panel change can pan the graph more than before.
- `keepInView` now applies on each call, also when the box does not move. So the camera handlers run after each panel change.
- An edge hint treats the whole corner rect as one obstacle. The gap between the zoom controls and the open overview map is part of it.
