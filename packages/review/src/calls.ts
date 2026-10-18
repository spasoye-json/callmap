import type { FunctionId } from '@archmap/graph-document';
import { calleesOf } from './hops.ts';
import type { Hops } from './hops.ts';

export type CallMark = 'added' | 'removed' | 'kept';

export interface MarkedCall {
  readonly caller: FunctionId;
  readonly callee: FunctionId;
  readonly mark: CallMark;
}

const callsAmong = (
  hops: Hops,
  shown: ReadonlySet<FunctionId>,
): readonly { readonly caller: FunctionId; readonly callee: FunctionId }[] =>
  [...hops.callees].flatMap(([caller, callees]) =>
    shown.has(caller)
      ? [...callees].filter((callee) => shown.has(callee)).map((callee) => ({ caller, callee }))
      : [],
  );

export const markedCallsOf = (
  base: Hops,
  branch: Hops,
  shown: ReadonlySet<FunctionId>,
): readonly MarkedCall[] => [
  ...callsAmong(branch, shown).map(({ caller, callee }): MarkedCall => ({
    caller,
    callee,
    mark: calleesOf(base, caller).has(callee) ? 'kept' : 'added',
  })),
  ...callsAmong(base, shown)
    .filter(({ caller, callee }) => !calleesOf(branch, caller).has(callee))
    .map(({ caller, callee }): MarkedCall => ({ caller, callee, mark: 'removed' })),
];
