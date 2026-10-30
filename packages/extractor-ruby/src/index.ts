/**
 * The Ruby extractor: the pass that reads a repo in scope and emits its graph document. It is a
 * separate process from the core, and the core owns the contract it emits against (ADR-0009).
 */

export { extractRuby, readRuby, RUBY } from './extract.ts';
export type { ExtractOptions, RubyRead } from './extract.ts';
export { ExtractionError } from './ripper.ts';
