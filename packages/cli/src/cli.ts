#!/usr/bin/env node
import { readArguments } from './arguments.ts';
import { runReview } from './review-command.ts';

try {
  const { out, notes } = await runReview(readArguments(process.argv.slice(2), process.cwd()));
  for (const note of notes) process.stderr.write(`${note}\n`);
  process.stdout.write(`${out}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
