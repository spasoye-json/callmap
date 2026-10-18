import type { FunctionId } from '@archmap/graph-document';
import type { GraphOfCaller } from './open-ends.ts';

export interface OneOfGroup {
  readonly id: string;
  readonly caller: FunctionId;
  readonly line: number;
  readonly callees: readonly FunctionId[];
}

export const oneOfGroupsOf = (
  shown: Iterable<FunctionId>,
  graphOf: GraphOfCaller,
): readonly OneOfGroup[] => {
  const groups = new Map<string, OneOfGroup>();
  for (const caller of shown) {
    for (const call of graphOf(caller).calls) {
      if (call.group === undefined || call.caller !== caller) continue;
      const known = groups.get(call.group);
      groups.set(call.group, {
        id: call.group,
        caller,
        line: call.line,
        callees: [...(known?.callees ?? []), call.callee],
      });
    }
  }
  return [...groups.values()].sort((left, right) => (left.id < right.id ? -1 : 1));
};
