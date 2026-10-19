/**
 * Which files of a repo a walk takes in: the scope globs that limit the walk (ADR-0011), and the
 * directories no walk enters. Language-blind and pure, so every extractor reads a scope the same
 * way.
 */

export { inScope } from './scope.ts';
export { isSkippedDirectory } from './skipped.ts';
