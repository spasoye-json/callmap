import type { GraphDocument } from '@callmap/graph-document';
import { callGraphOf } from './call-graph.ts';
import type { CallGraph } from './call-graph.ts';
import { resolutionRatesOf } from './rate.ts';
import type { LanguageRate } from './rate.ts';

export interface ReviewInput {
  readonly base: readonly GraphDocument[];
  readonly branch: readonly GraphDocument[];
}

export interface ReviewGraphs {
  readonly base: CallGraph;
  readonly branch: CallGraph;
  readonly resolutionRates: readonly LanguageRate[];
}

export const reviewGraphsOf = ({ base, branch }: ReviewInput): ReviewGraphs => ({
  base: callGraphOf(base),
  branch: callGraphOf(branch),
  resolutionRates: resolutionRatesOf(branch),
});
