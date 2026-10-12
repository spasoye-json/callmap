/**
 * The Ruby extractor: the pass that reads a repo of Rails apps in scope and emits its reference
 * graph document. It is a separate process from the core, and the core owns the contract it emits
 * against (ADR-0009).
 */

export { extractRuby, RUBY } from './extract.ts';
export type { ExtractOptions } from './extract.ts';
export { ExtractionError } from './references.ts';
export { inScope } from './scope.ts';
