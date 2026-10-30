# The Diff view shows levels over the Diff limit

Over the Diff limit, the Diff view shows one level at a time, as the Whole project view does (ADR-0017). Its levels hold only the changed functions and their neighbours. At the limit or under it, the Diff view stays one drawing. This changes decisions 3, 4 and 5 of ADR-0023. The owner chose this in the triage of issue #2 on 2026-10-30.

## Why

After ADR-0023, a review over the Diff limit opened on the Whole project view, and the Diff tab showed only a message. The Whole project view counts the changes on each box. But it also shows every folder with no change, and its file level shows every function and call of the file. The reader of a large review had to find the changes among the code that the branch did not touch.

The owner compared 3 choices:

- **Levels for the Diff view.** The owner chose this one. It keeps the meaning of the Diff view: the changes and one hop around them.
- **A "changes only" switch on the Whole project view.** It hides the boxes with no change. But its file level still shows the whole file, so one view mixes 2 meanings.
- **No change.** The Whole project view stays the only view of a large review.

## Decisions

1. **The same functions as the flat Diff view.** A level holds the changed functions and their neighbours, and the functions that a next hop or a search opened. A folder that holds none of them gets no box. A box counts the changed, added and removed functions, as a box of the Whole project view does.
2. **Levels only over the limit.** The flat drawing decides the shape. If its lines are over the Diff limit, the Diff view shows levels. If not, it stays one drawing. The check runs at each change of the opened functions, so clearing the next hops can bring the flat drawing back.
3. **The first level.** It is the deepest folder that holds every function of the Diff view. This is the rule of the Whole project view, on a smaller set of files.
4. **The review opens on the Diff view.** A review over the Diff limit opens on the first level of the Diff view, not on the Whole project view. The message of the part `diff-limit` goes away. The level bar says that the review is over the Diff limit, so the Diff view shows one level at a time.
5. **A next hop keeps the place.** If a next hop or a search takes the flat drawing over the limit, the Diff view opens the level of the file that holds the clicked function, with that function selected.
6. **No limit on a level.** A level of the Diff view holds a subset of the functions of the same level of the Whole project view, so it draws about the same lines or fewer. The levels of the Whole project view have no limit.
7. **The CLI lays out the first level.** The command lays out the first level of the Diff view, as it lays out the top level of the Whole project view. The page lays out each other level the first time that the reader opens it. The line on stderr says that the Diff view shows levels.

## Consequences

- A reader of a large review starts on the changes, not on the whole project.
- The Diff view has 2 shapes. A next hop can change the shape, so the reader can see the drawing change from one drawing to levels.
- The levels of the Diff view and of the Whole project view share one set of rules: the collapse of a folder chain, the outside boxes, the bundled lines and the breadcrumb.
