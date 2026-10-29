import type { FunctionId } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';

export type GraphOfCaller = (caller: FunctionId) => CallGraph;
