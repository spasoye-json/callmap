import type { FunctionId } from '@callmap/graph-document';
import type { GraphOfCaller } from './graph-of-caller.ts';
import { byText } from './order.ts';

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
  return [...groups.values()].sort((left, right) => byText(left.id, right.id));
};
