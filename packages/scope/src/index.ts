/**
 * Which files of a repo a walk takes in: the scope globs that limit the walk (ADR-0011), the
 * directories no walk enters, and the test files that a walk leaves out by default (ADR-0029).
 * Language-blind and pure, so every extractor reads a scope the same way.
 */

export { inScope } from './scope.ts';
export { isSkippedDirectory } from './skipped.ts';
export { effectiveScope, TEST_GLOBS } from './tests.ts';
