/**
 * The sidecar: the command surface the UI talks to, and the extractors it runs a repo through
 * (ADR-0006, ADR-0009).
 */

export { createSidecar } from './sidecar.ts';
export type { Sidecar, SidecarOptions } from './sidecar.ts';
export { ExtractorFailure, extractorArguments, runExtractorProcess } from './extractors.ts';
export type { ExtractorRegistration, ExtractorRun } from './extractors.ts';
export { REGISTERED_EXTRACTORS, typescriptExtractor } from './registered-extractors.ts';
export type * from './protocol.ts';
