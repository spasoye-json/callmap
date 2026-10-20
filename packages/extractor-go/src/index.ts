/**
 * The Go extractor: the pass that reads a repo in scope and emits its reference graph document. It
 * is a separate process from the core, written in Go, and the core owns the contract it emits
 * against (ADR-0009).
 */

export {
  extractGo,
  GO,
  GoExtractionError,
  goExtractorBinary,
  removeGoExtractorBinary,
} from './launch.ts';
export type { GoExtractOptions } from './launch.ts';
