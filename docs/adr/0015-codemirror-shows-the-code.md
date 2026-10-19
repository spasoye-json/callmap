# CodeMirror shows the code of a function

The code panel shows the code of a function in a read-only CodeMirror 6 editor. For a changed function, `unifiedMergeView` of `@codemirror/merge` shows a unified diff. The original document is the base text of the function, and the document is the branch text. Each removed line shows in red above the added lines in green, and the changed characters are bold on a stronger red or green, as in Git and GitHub. An added function is all green, and a removed function is all red. `@codemirror/lang-javascript` highlights TypeScript and JavaScript.

The panel of spec 24 showed the branch text as plain lines. It marked the lines that `git diff` changed, but it could not show the removed lines, and it had no syntax highlighting. On a real review, the owner could not see what the branch changed inside a function (issue 33).

The page diffs the base text and the branch text of each changed function itself. The CLI no longer runs `git diff`, and the review no longer carries changed lines. The page data holds the base place of each changed function, `basePlaces`, and the base text of each file with a changed or a removed function.

## Versions and licences

The CLI pins exact versions. Each package is under the MIT licence.

| Package                       | Version |
| ----------------------------- | ------- |
| `@codemirror/view`            | 6.43.13 |
| `@codemirror/state`           | 6.7.6   |
| `@codemirror/merge`           | 6.12.2  |
| `@codemirror/language`        | 6.12.4  |
| `@codemirror/lang-javascript` | 6.2.5   |
| `@lezer/highlight`            | 1.2.5   |

The packages that npm installs with them, such as `@lezer/javascript`, `@lezer/lr`, `@lezer/common`, `style-mod`, `w3c-keyname` and `crelt`, are also under the MIT licence.

## Consequences

- The bundle inlines CodeMirror, so the page still makes no network request. The page of the fixture review grows from 1,474,033 bytes to 1,859,126 bytes.
- The page uses `typescriptLanguage` and the other parsers of `@codemirror/lang-javascript`, not `javascript()`. So the bundle leaves out the autocomplete and the lint code.
- CodeMirror writes its own base styles at run time. The page styles the diff and the syntax with the colour tokens of `page.css`, so light mode and dark mode need no other work.
- The gutter shows the line numbers of the file. A removed line shows its number in the base, and every other line shows its number in the branch.
- A DOM test reads the editor in jsdom: the removed lines as `del`, the added lines as `ins`, the changed-text marks and the gutter.
- A new language needs one more parser in `page/code-editor.ts`.
