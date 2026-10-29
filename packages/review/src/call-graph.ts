import type { GraphDocument } from '@callmap/graph-document';

export type CallGraph = Pick<GraphDocument, 'functions' | 'calls' | 'openEnds'>;

export const callGraphOf = (documents: readonly GraphDocument[]): CallGraph => ({
  functions: documents.flatMap(({ functions }) => functions),
  calls: documents.flatMap(({ calls }) => calls),
  openEnds: documents.flatMap(({ openEnds }) => openEnds),
});
