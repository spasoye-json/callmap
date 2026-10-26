import type { Checker, GraphDocument } from '@callmap/graph-document';
import { byText } from './order.ts';

export interface ResolutionRate {
  readonly resolved: number;
  readonly open: number;
  readonly rate: number;
}

export interface LanguageRate extends ResolutionRate {
  readonly language: string;
  readonly checker: Checker;
}

export const resolutionRateOf = ({ calls, openEnds }: GraphDocument): ResolutionRate => {
  const plain = calls.filter(({ group }) => group === undefined).length;
  const groups = new Set(calls.flatMap(({ group }) => (group === undefined ? [] : [group])));
  const resolved = plain + groups.size;
  const open = openEnds.length;
  return { resolved, open, rate: resolved + open === 0 ? 1 : resolved / (resolved + open) };
};

export const resolutionRatesOf = (documents: readonly GraphDocument[]): readonly LanguageRate[] =>
  documents
    .map((document) => ({
      language: document.language,
      checker: document.checker,
      ...resolutionRateOf(document),
    }))
    .sort((left, right) => byText(left.language, right.language));
