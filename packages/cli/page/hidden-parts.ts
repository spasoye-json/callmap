import { appendTo } from '@callmap/review';
import type { FunctionMark } from '@callmap/review';
import { isHiddenBy } from './scene.ts';
import type { Scene } from './scene.ts';

const idsHiddenIn = (
  { frames, boxes, lines }: Scene,
  marks: ReadonlySet<FunctionMark>,
): ReadonlySet<string> => {
  const hidden = new Set(boxes.filter((box) => isHiddenBy(marks, box)).map(({ id }) => id));
  const callersOf = new Map<string, string[]>();
  for (const { from, to } of lines) appendTo(callersOf, to, from);
  for (const box of boxes) {
    if (box.kind !== 'open-end') continue;
    const callers = callersOf.get(box.id) ?? [box.caller];
    if (callers.every((caller) => hidden.has(caller))) hidden.add(box.id);
  }

  const childrenOf = new Map<string, string[]>();
  for (const { id, frame } of boxes) appendTo(childrenOf, frame, id);
  for (const { id, parent } of frames) if (parent !== undefined) appendTo(childrenOf, parent, id);
  const frameIds = new Set(frames.map(({ id }) => id));
  const isHidden = (id: string): boolean => {
    if (hidden.has(id)) return true;
    const children = childrenOf.get(id) ?? [];
    if (!frameIds.has(id) || children.length === 0 || !children.every(isHidden)) return false;
    hidden.add(id);
    return true;
  };
  for (const { id } of frames) isHidden(id);
  return hidden;
};

const kept = new WeakMap<Scene, { readonly key: string; readonly ids: ReadonlySet<string> }>();

export const hiddenIdsOf = (
  scene: Scene,
  marks: ReadonlySet<FunctionMark>,
): ReadonlySet<string> => {
  const key = [...marks].sort().join(' ');
  const known = kept.get(scene);
  if (known?.key === key) return known.ids;
  const ids = idsHiddenIn(scene, marks);
  kept.set(scene, { key, ids });
  return ids;
};
