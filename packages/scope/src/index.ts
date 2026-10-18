/**
 * Which files of a repo a walk takes in: the scope globs a repo is opened under (ADR-0011), and
 * the directories no walk enters. Language-blind and pure, so the host and every extractor read a
 * scope the same way.
 */

export { inScope } from './scope.ts';
export { isSkippedDirectory } from './skipped.ts';
