/**
 * The TypeScript extractor: the pass that reads a repo in scope and emits its reference graph
 * document. It is a separate process from the core, and the core owns the contract it emits
 * against (ADR-0009).
 */

export { ExtractionError, extractTypeScript, TYPESCRIPT } from './extract.ts';
export type { ExtractOptions } from './extract.ts';
export { moduleSpecifiers } from './imports.ts';
export { inScope } from './scope.ts';
export { sourceFilesInScope } from './walk.ts';
