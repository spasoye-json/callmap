import type { GraphDocument } from '@callmap/graph-document';

export interface ResolutionRate {
  readonly resolved: number;
  readonly open: number;
  readonly rate: number;
}

export const resolutionRateOf = ({ calls, openEnds }: GraphDocument): ResolutionRate => {
  const plain = calls.filter(({ group }) => group === undefined).length;
  const groups = new Set(calls.flatMap(({ group }) => (group === undefined ? [] : [group])));
  const resolved = plain + groups.size;
  const open = openEnds.length;
  return { resolved, open, rate: resolved + open === 0 ? 1 : resolved / (resolved + open) };
};
