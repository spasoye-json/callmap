import type { FunctionId, GraphDocument } from '@callmap/graph-document';

export type GraphOfCaller = (caller: FunctionId) => GraphDocument;
