/**
 * The TypeScript extractor: the pass that reads a repo in scope and emits its graph document. It
 * is a separate process from the core, and the core owns the contract it emits against (ADR-0009).
 */

export { ExtractionError } from './config.ts';
export type { ExtractOptions } from './config.ts';
export { extractTypeScript } from './extract.ts';
export { extractGraphDocument } from './graph.ts';
export { moduleSpecifiers } from './imports.ts';
export { sourceFilesInScope, TYPESCRIPT } from './walk.ts';
