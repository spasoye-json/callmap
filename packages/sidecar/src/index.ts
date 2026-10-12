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
export type * from './discovery-protocol.ts';
export { createAnthropicProvider, DEFAULT_MODEL } from './anthropic-provider.ts';
export type { AnthropicProviderOptions } from './anthropic-provider.ts';
export { createFakeProvider } from './fake-provider.ts';
export type { FakeProvider, FakeProviderOptions } from './fake-provider.ts';
export { ProviderFailure } from './provider.ts';
export type { AiAnswer, AiProvider, AiRequest } from './provider.ts';
export type { AiOptions } from './discovery-commands.ts';
export { MAP_DIRECTORY, MAP_FILE_PATHS, flowDocumentPath } from './map-file.ts';
export type { MapFileError, RefusedFlowFile } from './map-file.ts';
