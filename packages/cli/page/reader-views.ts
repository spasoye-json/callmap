import type { View } from './view.ts';
import { diffView } from './views/diff.ts';
import { folderView } from './views/folder.ts';
import { routeView } from './views/route.ts';
import { wholeProjectView } from './views/whole-project.ts';

export const READER_VIEWS: readonly [View, ...View[]] = [
  diffView,
  wholeProjectView,
  folderView,
  routeView,
];
