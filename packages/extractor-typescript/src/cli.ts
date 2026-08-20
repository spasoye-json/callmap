#!/usr/bin/env node
/**
 * The extractor as the host runs it: a separate process that reads a repo and writes its reference
 * graph document to standard output (ADR-0009). Nothing but the document goes to standard output,
 * so the host can pipe it straight into the core; a refusal goes to standard error with a
 * non-zero exit, so a repo it could not read is never mistaken for a repo with nothing in it.
 */

import { extractTypeScript } from './extract.ts';

const USAGE = 'usage: archmap-extract-typescript <repo> [--scope <glob>]... [--tsconfig <path>]';

class CliError extends Error {
  override readonly name = 'CliError';
}

interface Invocation {
  readonly repo: string;
  readonly scope: readonly string[];
  readonly tsconfig: string | undefined;
}

/**
 * Read the arguments. A flag it does not know and a value that follows no flag are both refused
 * rather than ignored, because an unread `--scope` would emit a document over the whole repo and
 * read as if that were what was asked for.
 */
const readArguments = (args: readonly string[]): Invocation => {
  const scope: string[] = [];
  let repo: string | undefined;
  let tsconfig: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (argument === '--scope' || argument === '--tsconfig') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`${argument} needs a value after it`);
      }
      if (argument === '--scope') scope.push(value);
      else tsconfig = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new CliError(`${argument} is not a flag this extractor knows`);
    } else if (repo === undefined) {
      repo = argument;
    } else {
      throw new CliError(`'${argument}' follows no flag; only one repo is read at a time`);
    }
  }

  if (repo === undefined) throw new CliError(USAGE);
  return { repo, scope, tsconfig };
};

const main = (args: readonly string[]): void => {
  const { repo, scope, tsconfig } = readArguments(args);
  const document = extractTypeScript(
    tsconfig === undefined ? { repo, scope } : { repo, scope, tsconfig },
  );
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
};

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
