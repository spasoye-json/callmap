#!/usr/bin/env node
/**
 * The Go extractor as a Node CLI, so a host runs it the way it runs every other extractor. It
 * builds the Go program, then hands it the arguments, standard output and standard error.
 */

import { spawnSync } from 'node:child_process';
import { goExtractorBinary } from './launch.ts';

try {
  const finished = spawnSync(goExtractorBinary(), process.argv.slice(2), { stdio: 'inherit' });
  if (finished.error !== undefined) throw finished.error;
  process.exitCode = finished.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
