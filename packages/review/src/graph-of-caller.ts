import type { FunctionId, GraphDocument } from '@archmap/graph-document';

export type GraphOfCaller = (caller: FunctionId) => GraphDocument;
